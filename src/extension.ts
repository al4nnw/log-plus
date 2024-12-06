// extension.ts

import * as vscode from "vscode";
import { RuleManager } from "./core/core";
import { registerHighlightCommands } from "./commands/highlightCommands";
import { registerCreateFlameGraphCommand } from "./commands/createFlameGraphCommand";

export function activate(context: vscode.ExtensionContext) {
	const ruleManager = new RuleManager(context);

	// Register highlight-related commands
	registerHighlightCommands(context, ruleManager);

	// Register flame graph command
	registerCreateFlameGraphCommand(context, ruleManager);

	// Initial decoration update if there's an active editor
	if (vscode.window.activeTextEditor) {
		ruleManager.triggerUpdateDecorations(vscode.window.activeTextEditor);
	}
}

export function deactivate() {
	// Clean up resources if necessary
}
