// commands/highlightCommands.ts

import * as vscode from "vscode";
import { RuleManager } from "../core/core";

export function registerHighlightCommands(
	context: vscode.ExtensionContext,
	ruleManager: RuleManager
) {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"logViewer.manageHighlightRules",
			async () => {
				await ruleManager.manageHighlightRules();
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.exportRules", async () => {
			await ruleManager.exportRules();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.importRules", async () => {
			await ruleManager.importRules();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.revertChanges", async () => {
			await ruleManager.revertChanges();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.convertToPlus", async () => {
			await ruleManager.convertToPlusFile();
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(async (document) => {
			await ruleManager.handleFileOpen(document);
		})
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor) {
				ruleManager.triggerUpdateDecorations(editor);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			const editor = vscode.window.activeTextEditor;
			if (editor && event.document === editor.document) {
				ruleManager.triggerUpdateDecorations(editor);
			}
		})
	);
}
