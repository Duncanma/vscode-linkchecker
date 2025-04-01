// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

let diagnosticCollection: vscode.DiagnosticCollection;

const documents: Map<vscode.Uri, number> = new Map();
export async function updateDiags(document: vscode.TextDocument) {
	if (!diagnosticCollection) {
		return;
	}

	if (documents.has(document.uri)) {
		if (documents.get(document.uri) === document.version) {
			return;
		}
	}
	documents.set(document.uri, document.version);

	// Use a regular expression to find all URLs in the text
	const urlRegex = /(?:\()(https?:\/\/[^\s\)]+)(?:\))/gm;

	diagnosticCollection.delete(document.uri);
	let diagnostics: vscode.Diagnostic[] = [];
	// Create a new array to store the results
	const results: { url: string; status: string }[] = [];

	for (let index = 0; index < document.lineCount; index++) {
		const line = document.lineAt(index);
		const matches = line.text.matchAll(urlRegex);

		// Iterate over the matches
		for (const match of matches) {
			const url = match[1];

			// Check if the URL is already in the results array
			if (results.some(result => result.url === url)) {
				continue;
			}

			// Check if the URL is valid
			try {
				new URL(url);
			} catch (error) {
				const status = `Bad link format (${url})`;
				results.push({ url, status });
				addDiagnostic(index, match, url, status);
				continue;
			}

			// Check if the URL is a valid link
			if (!url.startsWith('http') && !url.startsWith('//')) {
				const status = `Bad link format (${url})`;
				results.push({ url, status });
				addDiagnostic(index, match, url, status);
				continue;
			}
			//check if URL resolves
			try {
				console.log(`Testing URL: ${url}`);
				const response = await fetch(url);
				if (!response.ok) {
					const status = `Bad Response: ${response.statusText}::${response.status} (${url})`;
					results.push({ url, status });
					addDiagnostic(index, match, url, status);
					continue;
				}
				console.log(`Valid: ${url} ${response.status}`);
				results.push({ url, status: `valid: ${response.statusText}` });
			} catch (error) {
				//add error to results
				const status = `Error checking link: ${error}`;
				results.push({ url, status });
				addDiagnostic(index, match, url, status);
			}
		}
	}
	if (diagnostics && diagnostics.length > 0) {
		diagnosticCollection.set(document.uri, diagnostics);
	}

	function addDiagnostic(index: number, match: RegExpExecArray, url: string, message?: string) {
		if (!message) {
			message = `Invalid link: ${url}`;
		}
		const diagnostic = new vscode.Diagnostic(new vscode.Range(index, match.index + 1, index, match.index + url.length + 1),
			message, vscode.DiagnosticSeverity.Warning);
		diagnostics.push(diagnostic);
		console.log(`adding diagnostic for ${url}`);
	}
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	diagnosticCollection = vscode.languages.createDiagnosticCollection('linkchecker');
	context.subscriptions.push(diagnosticCollection);
	if (vscode.window.activeTextEditor) {
		updateDiags(vscode.window.activeTextEditor.document);
	}
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
		(e: vscode.TextEditor | undefined) => {
			if (e !== undefined && e.document.languageId === 'markdown') {
				updateDiags(e.document);
			}
		}));

   context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e:	vscode.TextDocumentChangeEvent) => {
		if (e.document &&  e.document.languageId === 'markdown') {
			updateDiags(e.document);
		}
   }));
}

// This method is called when your extension is deactivated
export function deactivate() {}