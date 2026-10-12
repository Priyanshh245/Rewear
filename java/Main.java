// Reads one JSON request from Python and writes one JSON response.
import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class Main {
    public static void main(String[] args) throws IOException {
        String request = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        JsonObject response;
        try {
            JsonObject input = JsonParser.parseString(request).getAsJsonObject();
            response = WardrobeEngine.call(input.get("tool").getAsString(), input.getAsJsonObject("arguments"));
        } catch (Exception error) {
            response = new JsonObject();
            response.addProperty("error", error instanceof IllegalArgumentException ? error.getMessage() : "Invalid matching request.");
        }
        System.out.println(new GsonBuilder().serializeNulls().create().toJson(response));
    }
}
