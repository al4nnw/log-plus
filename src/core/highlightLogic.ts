// core/highlightLogic.ts

import * as vscode from "vscode";
import { RuleManager, Rule } from "./core";
import * as path from "path";

export function applyHighlightRuleFunctions(rm: RuleManager) {
	rm.addHighlightRule = async (rmInternal: RuleManager) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const fileUri = editor.document.uri.toString();
		const fsPath = editor.document.uri.fsPath;
		const isPlusFile = fsPath.endsWith("-plus" + path.extname(fsPath));

		const ruleTypeOptions = ["Annotation"];
		if (isPlusFile) {
			ruleTypeOptions.push("Replacement");
		}

		const ruleTypePick = await vscode.window.showQuickPick(ruleTypeOptions, {
			placeHolder: "Select the type of rule to create",
		});

		if (!ruleTypePick) {
			return;
		}

		const ruleType = ruleTypePick.toLowerCase() as "annotation" | "replacement";

		const searchTerm = await vscode.window.showInputBox({
			prompt: "Enter the search term or pattern",
			placeHolder: "Search term",
		});

		if (searchTerm === undefined || searchTerm.trim() === "") {
			return;
		}

		const isRegexPick = await vscode.window.showQuickPick(["No", "Yes"], {
			placeHolder: "Is this a regular expression?",
		});

		if (!isRegexPick) {
			return;
		}

		const isRegex = isRegexPick === "Yes";

		let colorObj;
		let replacement;

		if (ruleType === "annotation") {
			const colorPick = await vscode.window.showQuickPick(
				rmInternal.getPredefinedColors().map((c) => c.display),
				{
					placeHolder: "Select a highlight color",
				}
			);

			if (!colorPick) {
				return;
			}

			colorObj = rmInternal
				.getPredefinedColors()
				.find((c) => c.display === colorPick);
			if (!colorObj) {
				return;
			}
		} else if (ruleType === "replacement") {
			replacement = await vscode.window.showInputBox({
				prompt: "Enter replacement text",
				placeHolder: "Replacement text",
			});

			if (replacement === undefined) {
				return;
			}

			if (replacement.includes(searchTerm)) {
				vscode.window.showErrorMessage(
					"Replacement text cannot contain the search term to prevent infinite loops."
				);
				return;
			}
		}

		const fileRules = rmInternal.getFileRules(fileUri) || [];

		const newRule: Rule = {
			condition: searchTerm,
			isRegex: isRegex,
			ruleType: ruleType,
			color: colorObj ? colorObj.value : "",
			displayColor: colorObj ? colorObj.display : "",
			replacement: replacement,
		};

		fileRules.push(newRule);
		rmInternal.setFileRules(fileUri, fileRules);

		await rmInternal.saveRules();

		if (editor) {
			rmInternal.updateDecorations(editor);
		}

		if (ruleType === "replacement" && editor) {
			await rmInternal.applyReplacementRule(editor, newRule);
			rmInternal.updateDecorations(editor);
		}

		rmInternal.getOutputChannel().appendLine(`Added new rule: ${searchTerm}`);
	};

	rm.deleteRule = async (
		rmInternal: RuleManager,
		rule: Rule,
		editor: vscode.TextEditor
	) => {
		const fileUri = editor.document.uri.toString();
		const rules = rmInternal.getFileRules(fileUri);

		const index = rules.indexOf(rule);
		if (index >= 0) {
			rules.splice(index, 1);
			await rmInternal.saveRules();

			if (rule.ruleType === "replacement") {
				await rmInternal.restoreOriginalContent(editor, rule);
			}

			rmInternal.updateDecorations(editor);
			rmInternal
				.getOutputChannel()
				.appendLine(`Deleted rule: ${rule.condition}`);
		}
	};

	rm.editRule = async (
		rmInternal: RuleManager,
		rule: Rule,
		editor: vscode.TextEditor
	) => {
		while (true) {
			const editOptions = [
				"Change Condition",
				"Toggle Regex",
				"Change Color/Replacement",
				"Back",
			];
			const selection = await vscode.window.showQuickPick(editOptions, {
				placeHolder: "Select an option to edit the rule",
			});

			if (!selection || selection === "Back") {
				break;
			}

			switch (selection) {
				case "Change Condition": {
					const newSearchTerm = await vscode.window.showInputBox({
						prompt: "Enter the new search term or pattern",
						value: rule.condition,
					});

					if (newSearchTerm === undefined || newSearchTerm.trim() === "") {
						return;
					}

					rule.condition = newSearchTerm;
					break;
				}
				case "Toggle Regex":
					rule.isRegex = !rule.isRegex;
					break;
				case "Change Color/Replacement":
					if (rule.ruleType === "annotation") {
						const colorPick = await vscode.window.showQuickPick(
							rmInternal.getPredefinedColors().map((c) => c.display),
							{
								placeHolder: "Select a highlight color",
								canPickMany: false,
								ignoreFocusOut: true,
							}
						);

						if (!colorPick) {
							return;
						}

						const colorObj = rmInternal
							.getPredefinedColors()
							.find((c) => c.display === colorPick);
						if (!colorObj) {
							return;
						}

						rule.color = colorObj.value;
						rule.displayColor = colorObj.display;
					} else if (rule.ruleType === "replacement") {
						const replacement = await vscode.window.showInputBox({
							prompt: "Enter replacement text",
							placeHolder: "Replacement text",
							value: rule.replacement,
						});

						if (replacement === undefined) {
							return;
						}

						if (replacement.includes(rule.condition)) {
							vscode.window.showErrorMessage(
								"Replacement text cannot contain the search term to prevent infinite loops."
							);
							return;
						}

						rule.replacement = replacement;
					}
					break;
			}

			await rmInternal.saveRules();
			if (editor) {
				rmInternal.updateDecorations(editor);
			}

			if (rule.ruleType === "replacement" && editor) {
				await rmInternal.applyReplacementRule(editor, rule);
				rmInternal.updateDecorations(editor);
			}
		}
	};

	rm.navigateToOccurrence = (
		rmInternal: RuleManager,
		occurrences: vscode.Range[],
		index: number,
		editor: vscode.TextEditor
	) => {
		if (occurrences.length === 0) {
			vscode.window.showInformationMessage("No occurrences found.");
			return;
		}

		const range = occurrences[index];
		editor.selection = new vscode.Selection(range.start, range.end);
		editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	};

	rm._manageHighlightRules = async (rmInternal: RuleManager) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const fileUri = editor.document.uri.toString();
		const fsPath = editor.document.uri.fsPath;
		const isPlusFile = fsPath.endsWith("-plus" + path.extname(fsPath));

		while (true) {
			const rules = rmInternal.getFileRules(fileUri) || [];

			const options: vscode.QuickPickItem[] = rules.map((rule, index) => {
				const icon = rule.ruleType === "annotation" ? "🔍" : "✏️";
				const colorName =
					rmInternal.getPredefinedColors().find((c) => c.value === rule.color)
						?.display || "Custom Color";
				const colorSquare = "■";
				return {
					label: `${index + 1}. ${colorSquare} ${icon} ${rule.condition}`,
					description: `${colorName}`,
				};
			});

			options.push(
				{ label: "Add a new rule", description: "" },
				{ label: "Import Rules", description: "" },
				{ label: "Export Rules", description: "" },
				isPlusFile
					? { label: "Revert Changes", description: "" }
					: { label: 'Convert to "-plus"', description: "" },
				{ label: "Exit", description: "" }
			);

			const selection = await vscode.window.showQuickPick(options, {
				placeHolder: "Select a rule to manage",
			});

			if (!selection || selection.label === "Exit") {
				return;
			}

			if (selection.label === "Add a new rule") {
				await rmInternal.addHighlightRule(rmInternal);
			} else if (selection.label === "Import Rules") {
				await rmInternal._importRules(rmInternal);
			} else if (selection.label === "Export Rules") {
				await rmInternal._exportRules(rmInternal);
			} else if (selection.label === 'Convert to "-plus"') {
				await rmInternal._convertToPlusFile(rmInternal);
			} else if (selection.label === "Revert Changes") {
				await rmInternal._revertChanges(rmInternal);
			} else {
				const index = parseInt(selection.label.split(".")[0]) - 1;
				const rulesRef = rmInternal.getFileRules(fileUri) || [];
				if (index >= 0 && index < rulesRef.length) {
					const rule = rulesRef[index];

					const occurrences = rmInternal.findOccurrences(rule, editor.document);
					let currentIndex = 0;

					const navigateOptions = [
						"First Occurrence",
						"Last Occurrence",
						"Previous Occurrence",
						"Next Occurrence",
						"Edit Rule",
						"Delete Rule",
						"Back",
					];

					while (true) {
						const selection2 = await vscode.window.showQuickPick(
							navigateOptions,
							{
								placeHolder: `Occurrences: ${occurrences.length}. Navigate or manage rule.`,
							}
						);

						if (!selection2) {
							break;
						}

						if (selection2 === "Back") {
							break;
						}

						switch (selection2) {
							case "First Occurrence":
								currentIndex = 0;
								rmInternal.navigateToOccurrence(
									rmInternal,
									occurrences,
									currentIndex,
									editor
								);
								break;
							case "Last Occurrence":
								currentIndex = occurrences.length - 1;
								rmInternal.navigateToOccurrence(
									rmInternal,
									occurrences,
									currentIndex,
									editor
								);
								break;
							case "Previous Occurrence":
								currentIndex =
									(currentIndex - 1 + occurrences.length) % occurrences.length;
								rmInternal.navigateToOccurrence(
									rmInternal,
									occurrences,
									currentIndex,
									editor
								);
								break;
							case "Next Occurrence":
								currentIndex = (currentIndex + 1) % occurrences.length;
								rmInternal.navigateToOccurrence(
									rmInternal,
									occurrences,
									currentIndex,
									editor
								);
								break;
							case "Edit Rule":
								await rmInternal.editRule(rmInternal, rule, editor);
								break;
							case "Delete Rule":
								await rmInternal.deleteRule(rmInternal, rule, editor);
								break;
						}
					}
				}
			}
		}
	};
}

export function applyImportExportFunctions(rm: RuleManager) {
	rm._exportRules = async (rmInternal: RuleManager) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const fileUri = editor.document.uri.toString();
		const rules = rmInternal.getFileRules(fileUri);

		if (!rules || rules.length === 0) {
			vscode.window.showInformationMessage("No rules to export for this file.");
			return;
		}

		const uri = await vscode.window.showSaveDialog({
			filters: { "JSON Files": ["json"] },
			defaultUri: vscode.Uri.file("rules.json"),
		});

		if (!uri) {
			return;
		}

		const rulesJson = JSON.stringify(rules, null, 2);

		await vscode.workspace.fs.writeFile(uri, Buffer.from(rulesJson, "utf8"));

		vscode.window.showInformationMessage("Rules exported successfully.");
		rmInternal.getOutputChannel().appendLine("Rules exported.");
	};

	rm._importRules = async (rmInternal: RuleManager) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const uris = await vscode.window.showOpenDialog({
			filters: { "JSON Files": ["json"] },
			canSelectMany: false,
		});

		if (!uris || uris.length === 0) {
			return;
		}

		const uri = uris[0];

		const fileContents = await vscode.workspace.fs.readFile(uri);
		const fileUri = editor.document.uri.toString();

		try {
			const importedRules: Rule[] = JSON.parse(fileContents.toString());

			if (!Array.isArray(importedRules)) {
				throw new Error("Invalid rules format.");
			}

			const action = await vscode.window.showQuickPick(["Replace", "Merge"], {
				placeHolder:
					"Do you want to replace existing rules or merge with them?",
			});

			if (!action) {
				return;
			}

			if (action === "Replace") {
				rmInternal.setFileRules(fileUri, importedRules);
			} else if (action === "Merge") {
				const existingRules = rmInternal.getFileRules(fileUri) || [];
				const mergedRulesMap: { [condition: string]: Rule } = {};

				for (const rule of existingRules) {
					mergedRulesMap[rule.condition] = rule;
				}
				for (const rule of importedRules) {
					mergedRulesMap[rule.condition] = rule; // Overwrite existing rule with the same condition
				}
				rmInternal.setFileRules(fileUri, Object.values(mergedRulesMap));
			}

			await rmInternal.saveRules();

			if (vscode.window.activeTextEditor) {
				rmInternal.updateDecorations(vscode.window.activeTextEditor);
			}

			vscode.window.showInformationMessage("Rules imported successfully.");
			rmInternal.getOutputChannel().appendLine("Rules imported.");
		} catch (error) {
			vscode.window.showErrorMessage(
				"Failed to import rules: " + (error as Error).message
			);
			rmInternal
				.getOutputChannel()
				.appendLine("Error importing rules: " + (error as Error).message);
		}
	};
}

export function applyRevertConvertFunctions(rm: RuleManager) {
	rm._revertChanges = async (rmInternal: RuleManager) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const document = editor.document;
		const filePath = document.uri.fsPath;

		if (!filePath.endsWith("-plus" + path.extname(filePath))) {
			vscode.window.showInformationMessage(
				'Revert is only available for "-plus" files.'
			);
			return;
		}

		const confirm = await vscode.window.showWarningMessage(
			"Are you sure you want to revert all changes?",
			"Yes",
			"No"
		);

		if (confirm !== "Yes") {
			return;
		}

		const originalFilePath = filePath.replace(
			"-plus" + path.extname(filePath),
			path.extname(filePath)
		);

		try {
			const originalContent = await vscode.workspace.fs.readFile(
				vscode.Uri.file(originalFilePath)
			);

			const edit = new vscode.WorkspaceEdit();
			const fullRange = new vscode.Range(
				document.positionAt(0),
				document.positionAt(document.getText().length)
			);
			edit.replace(document.uri, fullRange, originalContent.toString());
			await vscode.workspace.applyEdit(edit);

			const docUri = document.uri.toString();
			const oc = rmInternal.getOriginalContent();
			delete oc[docUri];
			rmInternal.setOriginalContent(oc);
			await rmInternal.saveOriginalContent();

			const fr = rmInternal.getFileRules(docUri);
			delete (rmInternal as any).fileRules[docUri]; // Safe since we control the code
			await rmInternal.saveRules();

			rmInternal.updateDecorations(editor);

			vscode.window.showInformationMessage("Changes reverted successfully.");
			rmInternal.getOutputChannel().appendLine("Reverted changes.");
		} catch (error) {
			vscode.window.showErrorMessage(
				"Failed to revert changes: " + (error as Error).message
			);
			rmInternal
				.getOutputChannel()
				.appendLine("Error reverting changes: " + (error as Error).message);
		}
	};

	rm._convertToPlusFile = async (
		rmInternal: RuleManager,
		document?: vscode.TextDocument
	) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		document = document || editor.document;
		const filePath = document.uri.fsPath;

		if (filePath.endsWith("-plus" + path.extname(filePath))) {
			vscode.window.showInformationMessage(
				'This file is already a "-plus" file.'
			);
			return;
		}

		const newFilePath = rmInternalGetPlusFilePath(filePath);

		try {
			let proceed = true;
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(newFilePath));
				const overwrite = await vscode.window.showWarningMessage(
					"The duplicate file already exists. Do you want to overwrite it?",
					"Yes",
					"No"
				);
				if (overwrite !== "Yes") {
					proceed = false;
				}
			} catch {
				// File does not exist, proceed
			}

			if (proceed) {
				await vscode.workspace.fs.copy(
					vscode.Uri.file(filePath),
					vscode.Uri.file(newFilePath),
					{ overwrite: true }
				);
				const newDocument = await vscode.workspace.openTextDocument(
					newFilePath
				);
				await vscode.window.showTextDocument(newDocument);

				const originalFilePath = document.uri.toString();
				const newFileUri = newDocument.uri.toString();

				const fileRules = rmInternal.getFileRules(originalFilePath);
				if (fileRules) {
					rmInternal.setFileRules(newFileUri, fileRules);
					await rmInternal.saveRules();
					if (vscode.window.activeTextEditor) {
						rmInternal.updateDecorations(vscode.window.activeTextEditor);
					}
				}

				rmInternal
					.getOutputChannel()
					.appendLine(`Converted ${filePath} to ${newFilePath}`);
			}
		} catch (error) {
			vscode.window.showErrorMessage(
				"Failed to create duplicate file: " + error
			);
			rmInternal
				.getOutputChannel()
				.appendLine("Error converting file: " + error);
		}

		function rmInternalGetPlusFilePath(filePath: string): string {
			const dir = path.dirname(filePath);
			const ext = path.extname(filePath);
			const baseName = path.basename(filePath, ext);
			const newFileName = `${baseName}-plus${ext}`;
			return path.join(dir, newFileName);
		}
	};

	// Also we need these two for replacement logic:
	rm.applyReplacementRule = async (editor: vscode.TextEditor, rule: Rule) => {
		const document = editor.document;
		const fileUri = document.uri.toString();
		const rmInternal = rm; // just to have a shorter name

		const edit = new vscode.WorkspaceEdit();
		const regex = rule.isRegex
			? new RegExp(rule.condition, "gi")
			: new RegExp(
					rmInternal["escapeRegExp"].call(rmInternal, rule.condition),
					"gi"
			  );

		const originalLines = rmInternal.getOriginalContent()[fileUri] || {};

		for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
			const line = document.lineAt(lineNum);
			let lineText = line.text;

			if (regex.test(lineText)) {
				if (!originalLines[lineNum]) {
					originalLines[lineNum] = lineText;
				}
				lineText = lineText.replace(regex, rule.replacement || "");
				edit.replace(document.uri, line.range, lineText);
			}
		}

		await vscode.workspace.applyEdit(edit);

		const oc = rmInternal.getOriginalContent();
		oc[fileUri] = originalLines;
		rmInternal.setOriginalContent(oc);
		await rmInternal.saveOriginalContent();

		rmInternal
			.getOutputChannel()
			.appendLine(`Applied replacement rule: ${rule.condition}`);
	};

	rm.restoreOriginalContent = async (editor: vscode.TextEditor, rule: Rule) => {
		const document = editor.document;
		const fileUri = document.uri.toString();
		const rmInternal = rm;
		const originalLines = rmInternal.getOriginalContent()[fileUri];

		if (!originalLines) {
			return;
		}

		const edit = new vscode.WorkspaceEdit();

		for (const lineNumStr in originalLines) {
			const lineNum = parseInt(lineNumStr, 10);
			const originalText = originalLines[lineNum];

			const line = document.lineAt(lineNum);
			edit.replace(document.uri, line.range, originalText);
		}

		await vscode.workspace.applyEdit(edit);

		const oc = rmInternal.getOriginalContent();
		delete oc[fileUri];
		rmInternal.setOriginalContent(oc);
		await rmInternal.saveOriginalContent();

		rmInternal
			.getOutputChannel()
			.appendLine(`Restored original content for rule: ${rule.condition}`);
	};
}
