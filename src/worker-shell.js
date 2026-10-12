// Hosted MCP endpoint and frontend files for REWEAR.
// Garment data calls require the identity supplied by the hosting platform.
const garmentSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 80
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100
    },
    category: {
      type: 'string',
      enum: CATEGORIES
    },
    color: {
      type: 'string',
      enum: COLORS
    },
    fit: {
      type: 'string',
      enum: ['slim', 'regular', 'relaxed']
    },
    pattern: {
      type: 'string',
      enum: ['plain', 'stripe', 'print']
    },
    styles: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'string',
        enum: STYLES
      }
    },
    seasons: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'string',
        enum: SEASONS
      }
    },
    available: {
      type: 'boolean'
    }
  },
  required: ['id', 'name', 'category', 'color', 'fit', 'pattern', 'styles', 'seasons', 'available']
};
const wardrobeSchema = {
  type: 'array',
  maxItems: 60,
  items: garmentSchema
};
const filters = {
  style: {
    type: 'string',
    enum: ['any', ...STYLES]
  },
  season: {
    type: 'string',
    enum: ['any', ...SEASONS]
  }
};
const specs = [
  ['search_wardrobe', 'Search supplied wardrobe metadata. This tool cannot read browser-local storage.', {
      wardrobe: wardrobeSchema,
      query: {
        type: 'string',
        maxLength: 100
      },
      category: {
        type: 'string',
        enum: ['any', ...CATEGORIES]
      },
      available_only: {
        type: 'boolean'
      }
    },
    ['wardrobe']
  ],
  ['build_outfits',
    'Enumerate available tag-compatible outfits from supplied wardrobe records. Up to 24 displayed combinations.', {
      wardrobe: wardrobeSchema,
      ...filters,
      focus_id: {
        type: ['string', 'null'],
        maxLength: 80
      }
    },
    ['wardrobe']
  ],
  ['check_outfit', 'Explain matching conflicts in a selected outfit using supplied records.', {
      wardrobe: wardrobeSchema,
      item_ids: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'string',
          maxLength: 80
        }
      },
      ...filters
    },
    ['wardrobe', 'item_ids']
  ],
  ['compare_purchase',
    'Explore candidate-based outfits and owned same-tag substitutes. Cost per wear uses your estimate in CAD.', {
      wardrobe: wardrobeSchema,
      candidate: garmentSchema,
      ...filters,
      price: {
        type: ['number', 'null'],
        minimum: 0,
        maximum: 100000
      },
      expected_wears: {
        type: ['integer', 'null'],
        minimum: 1,
        maximum: 10000
      }
    },
    ['wardrobe', 'candidate']
  ]
];
const TOOL_DEFINITIONS = specs.map(([name, description, properties, required]) => ({
  name,
  description,
  inputSchema: {
    type: 'object',
    properties,
    required
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
}));
const responseJson = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});
const rpcError = (id, code, message, status = 200) => responseJson({
  jsonrpc: '2.0',
  id: id ?? null,
  error: {
    code,
    message
  }
}, status);
const rpcResult = (id, result) => responseJson({
  jsonrpc: '2.0',
  id,
  result
});
const rates = new Map();

function allowCall(identity) {
  const now = Date.now();
  const bucket = rates.get(identity);
  if (!bucket || now - bucket.start > 60000) {
    if (rates.size > 2000) rates.clear();
    rates.set(identity, {
      start: now,
      count: 1
    });
    return true;
  }
  bucket.count++;
  return bucket.count <= 120;
}
async function boundedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty body');
  const parts = [];
  let size = 0;
  while (true) {
    const {
      done,
      value
    } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 600000) {
      await reader.cancel();
      throw new Error('Request too large');
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let pos = 0;
  for (const part of parts) {
    bytes.set(part, pos);
    pos += part.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function mcpEndpoint(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return responseJson({
    error: 'Invalid origin'
  }, 403);
  if (request.method === 'GET' || request.method === 'DELETE') return new Response(null, {
    status: 405,
    headers: {
      Allow: 'POST'
    }
  });
  if (request.method !== 'POST') return new Response(null, {
    status: 405,
    headers: {
      Allow: 'POST'
    }
  });
  let message;
  try {
    message = await boundedJson(request);
  } catch (error) {
    return rpcError(null, -32700, error.message === 'Request too large' ? 'Request too large' :
      'Invalid JSON', 400);
  }
  if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string')
    return rpcError(message?.id, -32600, 'Invalid JSON-RPC request');
  const {
    id,
    method
  } = message;
  if (id === undefined) {
    return new Response(null, {
      status: 202
    });
  }
  if (method === 'initialize') return rpcResult(id, {
    protocolVersion: '2025-06-18',
    capabilities: {
      tools: {
        listChanged: false
      }
    },
    serverInfo: {
      name: 'REWEAR',
      version: '1.0.0'
    },
    instructions: 'Explore outfits and compare purchases using caller-supplied garment metadata. Browser collections are local, never read automatically. Images are not analysed. Tags are a starting point, not a guarantee of visual fit.'
  });
  if (method === 'server/discover') return rpcResult(id, {
    supportedVersions: ['2025-06-18'],
    capabilities: {
      tools: {
        listChanged: false
      }
    },
    _meta: {
      'io.modelcontextprotocol/serverInfo': {
        name: 'REWEAR',
        version: '1.0.0'
      }
    }
  });
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') return rpcResult(id, {
    tools: TOOL_DEFINITIONS
  });
  if (method === 'tools/call') {
    const identity = request.headers.get('oai-authenticated-user-id');
    if (!identity) return responseJson({
      error: 'Authenticated user identity required.'
    }, 401);
    if (!allowCall(identity)) return responseJson({
      error: 'Too many requests. Try again in a minute.'
    }, 429);
    const name = message.params?.name,
      args = message.params?.arguments;
    const spec = TOOL_DEFINITIONS.find(x => x.name === name);
    if (!spec) return rpcError(id, -32602, 'Unknown tool');
    if (!args || typeof args !== 'object' || Array.isArray(args) || spec.inputSchema.required.some(key =>
        args[key] === undefined)) return rpcError(id, -32602, 'Missing required tool arguments');
    try {
      const result = callTool(name, args);
      return rpcResult(id, {
        content: [{
          type: 'text',
          text: JSON.stringify(result)
        }],
        structuredContent: result,
        isError: false
      });
    } catch (error) {
      return rpcResult(id, {
        content: [{
          type: 'text',
          text: error.message
        }],
        isError: true
      });
    }
  }
  return rpcError(id, -32601, 'Method not found');
}

function binary(base64, type, filename) {
  const raw = atob(base64),
    bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const headers = {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600'
  };
  if (filename) headers['Content-Disposition'] = 'attachment; filename="' + filename + '"';
  return new Response(bytes, {
    headers
  });
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/mcp' || path === '/mcp/') return mcpEndpoint(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {
      status: 405,
      headers: {
        Allow: 'GET, HEAD'
      }
    });
    const files = {
      '/': [HTML, 'text/html'],
      '/styles.css': [CSS, 'text/css'],
      '/app.js': [APP_JS, 'text/javascript']
    };
    if (files[path]) return new Response(request.method === 'HEAD' ? null : files[path][0], {
      headers: {
        'Content-Type': files[path][1] + '; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
    if (['/rewear-starter.zip', '/rewear-github.zip'].includes(path)) {
      return binary(STARTER_ZIP, 'application/zip', path.slice(1));
    }
    return new Response('Not found', {
      status: 404
    });
  }
};
