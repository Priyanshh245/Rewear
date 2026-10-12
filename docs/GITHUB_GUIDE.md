# Put REWEAR on your GitHub

These instructions are for Priyansh Panwar's REWEAR project. The package includes the Python app, frontend, hosted-source code, tests and documentation.

## 1. Download and unzip

Download `rewear-github.zip`, then double-click it on your Mac. Open the extracted `rewear` folder. You should see `README.md`, `python`, `public`, `src`, `tests`, `scripts`, `docs` and `package.json`.

Upload the contents of this folder to GitHub. A ZIP uploaded as one file will not show the actual project code.

## 2. Create the repository

Open https://github.com/new and use your own account as the owner.

- Repository name: `rewear`
- Description: `A Python and MCP wardrobe app for building outfits and checking potential purchases against clothes you own.`
- Visibility: Public if you want recruiters to view the code.
- Leave the README, .gitignore and license initialization options off. The package already contains a README and .gitignore. You can choose a license separately later.

Click **Create repository**.

## 3. Upload through the website

On the new repository page, click **uploading an existing file**, or **Add file → Upload files** if that menu is shown.

In Finder, open the extracted `rewear` folder. Press **Command+Shift+.** to show hidden files. Select the source files and folders, including `.gitignore` and `.openai` from this clean package, and drag them into the upload page.

`README.md` must be at the repository root, not inside a second `rewear` folder. The clean ZIP has no credentials, private hosting ID, personal wardrobe backups, virtual environment or Git history.

Use the commit message `Add REWEAR wardrobe and purchase comparison app`, then commit the uploaded files. Follow any branch or pull-request prompt GitHub shows.

This package has fewer than 100 files and each file is below GitHub's browser upload limit.

Reference: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

## 4. Check the repository

The README should render automatically below the file list. Open `python/wardrobe.py` and `public/app.js` to confirm you uploaded readable source code.

In the repository's **About** area, add the description above. Suggested topics: `python`, `javascript`, `html`, `css`, `mcp`, `wardrobe`, `fashion`, `personal-project`.

GitHub stores the code. Uploading this repository does not start the Python app. Run it locally using the next section. GitHub Pages only serves static files, so it cannot run this Python MCP backend.

## 5. Run it on your Mac

Open Terminal and enter `cd ` with a space after it. Drag the extracted `rewear` folder from Finder into Terminal, then press Return. This enters the correct folder even if your download location or folder name differs.

Check that you have Python:

```sh
python3 --version
```

You need Python 3.10 or newer. If it is missing or older, install a current compatible Python version from https://www.python.org/downloads/.

Then run these commands one at a time:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r python/requirements.txt
python python/server.py
```

Open http://127.0.0.1:8000 in Safari or another browser. Click **Explore sample wardrobe**, try the studio and purchase comparison, then add your own clothes.

Keep Terminal running. Press **Control+C** when finished. On another day:

```sh
source .venv/bin/activate
python python/server.py
```

If port 8000 is already being used, close the other server, or run:

```sh
python -m uvicorn server:app --app-dir python --host 127.0.0.1 --port 8001
```

Then visit http://127.0.0.1:8001. Your browser's saved collection is tied to its origin, so a different port has a separate collection. Export and restore a backup to move it.

## 6. Run the tests

From the project folder with `.venv` active:

```sh
python -m unittest discover -s tests -p 'test_*.py'
```

The Python checks cover the rules and actual MCP transport. For JavaScript and cross-language checks, install Node 18 or newer and run:

```sh
node --test tests/*.test.mjs
```

## Alternative: upload with Terminal

Use this instead of the website upload if you prefer Git. Start from the clean extracted package and a new empty GitHub repository.

```sh
git init
git branch -M main
git add .
git commit -m "Add REWEAR wardrobe and purchase comparison app"
git remote add origin https://github.com/Priyanshh245/rewear.git
git push -u origin main
```

The remote assumes your username is `Priyanshh245` and your repository is called `rewear`; replace either if needed. Git may ask you to set your name/email or authenticate with GitHub. Use your own account details. GitHub account passwords are not used for HTTPS Git authentication; follow GitHub's current authentication instructions or use GitHub Desktop.

If you used website upload first, clone that repository before making future Git commits:

```sh
git clone https://github.com/Priyanshh245/rewear.git
cd rewear
```

Make changes in this cloned folder, then:

```sh
git add .
git commit -m "Describe what changed"
git push
```

This keeps the repository's existing history. Avoid starting a separate Git history on top of a repository you already populated through the website.

Reference: https://docs.github.com/en/get-started/using-git/pushing-commits-to-a-remote-repository

## Explain the project

Read `docs/CODE_WALKTHROUGH.md`, run the sample app and make a small change you understand. You should be able to explain how tags become combinations, how duplicates are checked, where browser data is stored and why the local and hosted versions use different server languages.

A concise description:

> REWEAR is my wardrobe project using Python, JavaScript and MCP. It helps users build outfits from clothes they own and test potential purchases using explainable tag-based rules.

The README includes a short, factual AI-assistance acknowledgement. Keep descriptions focused on the functionality you can demonstrate and explain.
