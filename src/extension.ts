import { debounce } from "ts-debounce";
import * as vscode from "vscode";

let diagnosticCollection: vscode.DiagnosticCollection;
let linkCheckerStatus: vscode.StatusBarItem;

const documents: Map<vscode.Uri, number> = new Map();
export async function updateDiags(
  document: vscode.TextDocument,
  force: boolean = false
) {
  if (!diagnosticCollection) {
    return;
  }

  if (!force) {
    if (documents.has(document.uri)) {
      if (documents.get(document.uri) === document.version) {
        return;
      }
    }
  }
  documents.set(document.uri, document.version);

  linkCheckerStatus.text = `$(loading~spin) Checking links...`;
  linkCheckerStatus.show();

  // Use a regular expression to find all URLs in the text
  //const urlRegex = /(?:\()(https?:\/\/[^\s\)]+)(?:\))/gm;
  const urlRegex = /(?:\[(?:[^\]]+)\])\((https?:\/\/)/gm;

  diagnosticCollection.delete(document.uri);
  let diagnostics: vscode.Diagnostic[] = [];
  // Create a new array to store the results
  const results: { url: string; valid: boolean; status: string }[] = [];

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const line = document.lineAt(lineNumber);
    const matches = line.text.matchAll(urlRegex);

    // Iterate over the matches
    for (const match of matches) {
      const urlStart = match.index + match[0].indexOf("http");

      let inParenthesis = false;
      let found = false;
      let url = "";
      for (let i = urlStart; i < line.text.length; i++) {
        if (line.text[i] === "(") {
          inParenthesis = true;
        } else if (line.text[i] === ")") {
          if (inParenthesis) {
            inParenthesis = false;
          } else {
            url = line.text.substring(urlStart, i);
            found = true;
            break;
          }
        }
      }
	  if (!found) {
		continue;
	  }
      // Check if the URL is already in the results array
      const existingResult = results.find((result) => result.url === url);
      if (existingResult) {
        // If the URL is already in the results, skip it
        if (!existingResult.valid) {
          // If the URL is not valid, add a diagnostic
          addDiagnostic(lineNumber, urlStart, url, existingResult.status);
        }
        continue;
      }

      // Check if the URL is valid
      try {
        new URL(url);
      } catch (error) {
        const status = `Bad link format (${url})`;
        const valid = false;
        results.push({ url, valid, status });
        addDiagnostic(lineNumber, urlStart, url, status);
        continue;
      }

      // Check if the URL is a valid link
      if (!url.startsWith("http") && !url.startsWith("//")) {
        const status = `Bad link format (${url})`;
        const valid = false;
        results.push({ url, valid, status });
        addDiagnostic(lineNumber, urlStart, url, status);
        continue;
      }
      //check if URL resolves
      try {
        console.log(`Testing URL: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
          const status = `Bad Response: ${response.statusText}::${response.status} (${url})`;
          const valid = false;
          results.push({ url, valid, status });
          addDiagnostic(lineNumber, urlStart, url, status);
          continue;
        }
        console.log(`Valid: ${url} ${response.status}`);
        results.push({
          url,
          valid: true,
          status: `valid: ${response.statusText}`,
        });
      } catch (error) {
        //add error to results
        const status = `Error checking link: ${error}`;
        const valid = false;
        results.push({ url, valid, status });
        addDiagnostic(lineNumber, urlStart, url, status);
      }
    }
  }
  if (diagnostics && diagnostics.length > 0) {
    diagnosticCollection.set(document.uri, diagnostics);
  }

  linkCheckerStatus.text = `$(check) Checked links`;
  linkCheckerStatus.command = "linkchecker.recheckLinks";
  linkCheckerStatus.tooltip = "Click to recheck links";
  function addDiagnostic(
    lineNumber: number,
    urlStart: number,
    url: string,
    message?: string
  ) {
    if (!message) {
      message = `Invalid link: ${url}`;
    }
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(
        lineNumber,
        urlStart + 1,
        lineNumber,
        urlStart + url.length + 1
      ),
      message,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostics.push(diagnostic);
    console.log(`adding diagnostic for ${url}`);
  }
}

// Called at startup
export function activate(context: vscode.ExtensionContext) {
  diagnosticCollection =
    vscode.languages.createDiagnosticCollection("linkchecker");

  linkCheckerStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  context.subscriptions.push(linkCheckerStatus);
  context.subscriptions.push(diagnosticCollection);

  if (vscode.window.activeTextEditor) {
    updateDiags(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(
      (e: vscode.TextEditor | undefined) => {
        if (e && e.document && e.document.languageId === "markdown") {
          updateDiags(e.document);
        }
      }
    )
  );

  // Listen for changes to the text document
  // need to debounce this to avoid too many calls
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(
      (e: vscode.TextDocumentChangeEvent) => {
        debounce(() => {
          if (e.document && e.document.languageId === "markdown") {
            updateDiags(e.document);
          }
        }, 1000);
      }
    )
  );

  const command = "linkchecker.recheckLinks";

  const commandHandler = () => {
    if (
      vscode.window.activeTextEditor &&
      vscode.window.activeTextEditor.document.languageId === "markdown"
    ) {
      updateDiags(vscode.window.activeTextEditor.document, true);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(command, commandHandler)
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
