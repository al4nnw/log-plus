// commands/createFlameGraphCommand.ts

import * as vscode from "vscode";
import { RuleManager } from "../core/core";
import {
	pickDatePattern,
	pickBlockPattern,
	parseLinesForEvents,
	createFlameGraphHTML,
	FlameEvent,
} from "../core/flameGraphLogic";

export function registerCreateFlameGraphCommand(
	context: vscode.ExtensionContext,
	ruleManager: RuleManager
) {
	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.createFlameGraph", async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage(
					"No active editor found. Please open a file and select some lines."
				);
				return;
			}

			const selection = editor.selection;
			if (selection.isEmpty) {
				vscode.window.showInformationMessage(
					"No lines selected. Please select some lines containing log events."
				);
				return;
			}

			const lines: string[] = [];
			for (
				let lineNum = selection.start.line;
				lineNum <= selection.end.line;
				lineNum++
			) {
				lines.push(editor.document.lineAt(lineNum).text);
			}

			// Prompt user for date pattern
			const storedDatePattern = ruleManager
				.getContext()
				.workspaceState.get<string>("flameGraphDatePattern");
			const datePattern = await pickDatePattern(storedDatePattern);
			if (!datePattern) {
				vscode.window.showInformationMessage(
					"Date pattern selection canceled."
				);
				return;
			}

			// Persist chosen date pattern
			await ruleManager
				.getContext()
				.workspaceState.update("flameGraphDatePattern", datePattern);

			// Prompt user for block name pattern
			const storedBlockPattern = ruleManager
				.getContext()
				.workspaceState.get<string>("flameGraphBlockPattern");
			const blockPattern = await pickBlockPattern(storedBlockPattern);
			if (!blockPattern) {
				vscode.window.showInformationMessage(
					"Block pattern selection canceled."
				);
				return;
			}

			// Persist chosen block pattern
			await ruleManager
				.getContext()
				.workspaceState.update("flameGraphBlockPattern", blockPattern);

			// Parse lines to extract events
			const events = parseLinesForEvents(
				lines,
				datePattern,
				blockPattern,
				editor.selection.start.line
			);
			if (events.length === 0) {
				vscode.window.showWarningMessage(
					"No valid events found with the given patterns. Try adjusting the date or block name patterns."
				);
				return;
			}

			// Sort events by timestamp
			events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

			// Collect rules and counts from ruleManager
			const rules = ruleManager.getRules(); // Assuming this method exists
			const rulesCounts: { rule: string; count: number }[] = [];
			for (const rule of rules) {
				const count = rule.getMatchCount(); // Assuming each rule has a getMatchCount() method
				rulesCounts.push({ rule: rule.name, count });
			}

			// Create flame graph webview
			const panel = vscode.window.createWebviewPanel(
				"flameGraph",
				"Flame Graph",
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				}
			);

			// Generate HTML for the flame graph
			panel.webview.html = createFlameGraphHTML(
				panel.webview,
				events,
				rulesCounts
			);

			// Handle messages from the webview
			panel.webview.onDidReceiveMessage((message) => {
				if (message.command === "goToLine") {
					const lineNumber = message.line;
					const pos = new vscode.Position(lineNumber, 0);
					vscode.window
						.showTextDocument(editor.document, vscode.ViewColumn.One)
						.then((ed) => {
							ed.revealRange(
								new vscode.Range(pos, pos),
								vscode.TextEditorRevealType.InCenter
							);
							ed.selection = new vscode.Selection(pos, pos);
						});
				}
			});
		})
	);
}
