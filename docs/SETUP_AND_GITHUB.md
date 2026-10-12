# Mac setup and GitHub upload

## 1. Keep the earlier project separate

Unzip this package into Downloads. The new folder is `rewear-python-java`. It runs on port 8050, so it is separate from the earlier app on port 8000.

If you already added real clothes to the earlier version, open it and click Export wardrobe backup. In this corrected version, use Restore a backup to import that JSON file. If you used only the sample collection, you can simply load the new sample wardrobe.

## 2. Check Java

In Terminal:

```sh
java -version
javac -version
```

You need a JDK 17 or newer. If you already have a suitable JDK, continue to step 3.

If it is missing or older, get the official Eclipse Temurin installer from https://adoptium.net/temurin/releases/. Choose version 21 LTS, macOS, JDK and the correct architecture. Your Mac's earlier package output showed ARM64, so use the Apple Silicon/aarch64 installer. Download the `.pkg`, open it and follow the installation steps. Close and reopen Terminal, then check the versions again.

Official macOS installer instructions: https://adoptium.net/installation/macOS

If several JDKs are installed and the default is older, select an installed version 21 for this Terminal session:

```sh
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

## 3. Run the website

You already installed Python 3.13. From Terminal:

```sh
cd ~/Downloads/rewear-python-java
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install -r python/requirements.txt
python python/server.py
```

Open http://127.0.0.1:8050 in Safari. Keep Terminal running. The Java source is compiled automatically when necessary. There is no npm or Node setup.

## 4. Try a complete flow

1. Load the sample wardrobe from My wardrobe.
2. Open Outfit studio and select a white tee, blue jeans and white sneakers.
3. Click Check combination. Then name it Coffee run and save it.
4. In Before you buy, try black sneakers: shoes, black, regular fit, plain pattern, casual/streetwear, all three seasons. Use price 90 and estimated wears 30.
5. Inspect the pairings and CAD $3.00 estimated cost per wear. Add the item as owned only when appropriate.
6. In Saved & worn, log an actual wear and try undoing it.
7. Export a backup. Restore it when you want to transfer or recover the collection.

## 5. Upload to GitHub — easiest route

Create a new repository called `rewear-python-java` at https://github.com/new. This keeps the earlier repository available while you switch over.

Suggested description: `A Python and Java wardrobe app with MCP tools, outfit matching and purchase comparison.`

Choose Public if you want others to view the source. Leave the README and .gitignore initialization options off because they are included.

Open the new repository's upload page. Drag in the contents of this clean extracted package: `java`, `python`, `templates`, `static`, `tests`, `docs`, `lib`, `README.md`, `THIRD_PARTY.md` and `.gitignore`.

Press Command+Shift+period in Finder to show `.gitignore`. If it will not upload, use Add file → Create new file, name it `.gitignore`, and paste the package's contents into it.

Commit the source files with `Add Python and Java version of REWEAR`. Do not upload the ZIP as a single file. Keep README.md at the repository root. Upload the clean package before running it, or exclude the generated `.venv`, `build` and `data` folders from your browser selection.

Reference: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

## Alternative: replace the code in your existing Rewear repository

Do this from a fresh clone in a separate folder. The new branch keeps the existing `main` version available until you review and merge the change.

Assuming both the new package and the clone are in Downloads:

```sh
cd ~/Downloads
git clone https://github.com/Priyanshh245/Rewear.git rewear-repo
cd rewear-repo
git switch -c python-java
```

Now you are in the new branch of a fresh clone. The next command removes its tracked old source files, so check your location with `pwd` and the branch with `git branch --show-current` first. They should identify `rewear-repo` and `python-java`.

```sh
git rm -r .
```

Copy the new source folders, `README.md`, `THIRD_PARTY.md` and `.gitignore` from the clean `rewear-python-java` package into this clone using Finder. Exclude `.venv`, `build`, `data` and personal backups if you have already run the package.

Then:

```sh
git add .
git commit -m "Replace frontend and matching stack with Python and Java"
git push -u origin python-java
```

Authenticate using your own GitHub account when requested. On GitHub, review the new branch and open a pull request from `python-java` into `main`. Merge it when you are satisfied. This removes the earlier JavaScript source from the current main version while preserving its old commit history.

Reference: https://docs.github.com/en/get-started/using-git/pushing-commits-to-a-remote-repository

## 6. Test the project

With the Python environment active:

```sh
python -m unittest discover -s tests -p 'test_*.py'
```

Tests use temporary data and a temporary local server. Your real collection is not used.

## What to put on your resume

Stack: **Python, Java, HTML/CSS, MCP, Starlette, Uvicorn, Jinja2, Gson**.

Describe it as a wardrobe and purchase comparison app with Java matching rules exposed through a Python MCP server. The README includes a short AI-assistance acknowledgement. Practise explaining the parts you can demonstrate.

Uploading code to GitHub does not host the Python and Java processes. The earlier hosted preview is still the earlier implementation. This corrected version runs locally until you deploy it on a platform supporting both runtimes.
