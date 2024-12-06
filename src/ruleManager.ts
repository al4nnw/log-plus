// ruleManager.ts

import * as vscode from "vscode";
import * as path from "path";

interface Rule {
	condition: string;
	color: string;
	displayColor: string; // For display purposes in the UI
	isRegex: boolean;
	replacement?: string; // For replacement rules
	ruleType: "annotation" | "replacement";
}

interface FileRules {
	[filePath: string]: Rule[];
}

interface OriginalContent {
	[filePath: string]: { [lineNumber: number]: string };
}

export class RuleManager {
	private fileRules: FileRules = {};
	private originalContent: OriginalContent = {};
	private lineDecorationTypes: {
		[color: string]: vscode.TextEditorDecorationType;
	} = {};
	private matchDecorationTypes: {
		[color: string]: vscode.TextEditorDecorationType;
	} = {};
	private indicatorDecorationType: vscode.TextEditorDecorationType;
	private warningDecorationType: vscode.TextEditorDecorationType;
	private updateTimeout: NodeJS.Timeout | undefined = undefined;
	private context: vscode.ExtensionContext;
	private predefinedColors: { name: string; value: string; display: string }[] =
		[
			{ name: "Yellow", value: "rgba(255, 255, 0, 1)", display: "Yellow" },
			{
				name: "LightGreen",
				value: "rgba(144, 238, 144, 1)",
				display: "Light Green",
			},
			{
				name: "LightCoral",
				value: "rgba(240, 128, 128, 1)",
				display: "Light Coral",
			},
			{
				name: "LightBlue",
				value: "rgba(173, 216, 230, 1)",
				display: "Light Blue",
			},
			{ name: "Khaki", value: "rgba(240, 230, 140, 1)", display: "Khaki" },
			{ name: "Plum", value: "rgba(221, 160, 221, 1)", display: "Plum" },
			{
				name: "LightSalmon",
				value: "rgba(255, 160, 122, 1)",
				display: "Light Salmon",
			},
			{
				name: "MediumAquamarine",
				value: "rgba(102, 205, 170, 1)",
				display: "Medium Aquamarine",
			},
			{
				name: "PaleTurquoise",
				value: "rgba(175, 238, 238, 1)",
				display: "Pale Turquoise",
			},
			{
				name: "MistyRose",
				value: "rgba(255, 228, 225, 1)",
				display: "Misty Rose",
			},
		];

	private outputChannel: vscode.OutputChannel;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Initialize output channel before loading rules
		this.outputChannel = vscode.window.createOutputChannel("LogViewer");
		this.outputChannel.appendLine("Extension activated.");

		this.loadRules();
		this.loadOriginalContent();

		this.indicatorDecorationType = vscode.window.createTextEditorDecorationType(
			{
				after: {
					margin: "0 0 0 4px",
				},
				overviewRulerColor: "gray",
				overviewRulerLane: vscode.OverviewRulerLane.Center,
			}
		);

		this.warningDecorationType = vscode.window.createTextEditorDecorationType({
			after: {
				contentText: "⚠️",
				margin: "0 0 0 4px",
			},
			overviewRulerColor: "yellow",
			overviewRulerLane: vscode.OverviewRulerLane.Right,
		});
	}

	public async handleFileOpen(document: vscode.TextDocument) {
		const filePath = document.uri.fsPath;

		// Ignore untitled or non-file URIs
		if (document.isUntitled || document.uri.scheme !== "file") {
			return;
		}

		// Check if it's already a "-plus" file
		if (filePath.endsWith("-plus" + path.extname(filePath))) {
			return;
		}

		// Prompt the user to duplicate the file
		const duplicate = await vscode.window.showInformationMessage(
			"Do you want to work on a duplicate of this file to avoid modifying the original?",
			"Yes",
			"No"
		);

		if (duplicate === "Yes") {
			await this.convertToPlusFile(document);
		}
	}

	public async convertToPlusFile(document?: vscode.TextDocument) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		document = document || editor.document;
		const filePath = document.uri.fsPath;

		// Check if it's already a "-plus" file
		if (filePath.endsWith("-plus" + path.extname(filePath))) {
			vscode.window.showInformationMessage(
				'This file is already a "-plus" file.'
			);
			return;
		}

		const newFilePath = this.getPlusFilePath(filePath);

		try {
			let proceed = true;
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(newFilePath));
				// File exists
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
				// Copy the file
				await vscode.workspace.fs.copy(
					vscode.Uri.file(filePath),
					vscode.Uri.file(newFilePath),
					{ overwrite: true }
				);
				// Open the new file
				const newDocument = await vscode.workspace.openTextDocument(
					newFilePath
				);
				await vscode.window.showTextDocument(newDocument);

				// Copy the rules from the original file to the new file
				const originalFilePath = document.uri.toString();
				const newFileUri = newDocument.uri.toString();

				if (this.fileRules[originalFilePath]) {
					this.fileRules[newFileUri] = this.fileRules[originalFilePath];
					await this.saveRules();
					if (vscode.window.activeTextEditor) {
						this.updateDecorations(vscode.window.activeTextEditor);
					}
				}

				this.outputChannel.appendLine(
					`Converted ${filePath} to ${newFilePath}`
				);
			}
		} catch (error) {
			vscode.window.showErrorMessage(
				"Failed to create duplicate file: " + error
			);
			this.outputChannel.appendLine("Error converting file: " + error);
		}
	}

	private getPlusFilePath(filePath: string): string {
		const dir = path.dirname(filePath);
		const ext = path.extname(filePath);
		const baseName = path.basename(filePath, ext);
		const newFileName = `${baseName}-plus${ext}`;
		return path.join(dir, newFileName);
	}

	public triggerUpdateDecorations(editor: vscode.TextEditor) {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}
		this.updateTimeout = setTimeout(() => {
			this.updateDecorations(editor);
		}, 300);
	}

	public updateDecorations(editor: vscode.TextEditor) {
		const fileUri = editor.document.uri.toString();
		const rules = this.fileRules[fileUri];

		if (!rules || rules.length === 0) {
			for (const decorationType of Object.values(this.lineDecorationTypes)) {
				editor.setDecorations(decorationType, []);
			}
			for (const decorationType of Object.values(this.matchDecorationTypes)) {
				editor.setDecorations(decorationType, []);
			}
			editor.setDecorations(this.indicatorDecorationType, []);
			editor.setDecorations(this.warningDecorationType, []);
			return;
		}

		for (const decorationType of Object.values(this.lineDecorationTypes)) {
			editor.setDecorations(decorationType, []);
		}
		for (const decorationType of Object.values(this.matchDecorationTypes)) {
			editor.setDecorations(decorationType, []);
		}
		editor.setDecorations(this.indicatorDecorationType, []);
		editor.setDecorations(this.warningDecorationType, []);

		const indicatorDecorationOptions: vscode.DecorationOptions[] = [];
		const lineDecorationOptionsMap: {
			[color: string]: vscode.DecorationOptions[];
		} = {};
		const matchDecorationOptionsMap: {
			[color: string]: vscode.DecorationOptions[];
		} = {};
		const warningDecorationOptions: vscode.DecorationOptions[] = [];
		const replacementCounts: { [line: number]: number } = {};

		for (let lineNum = 0; lineNum < editor.document.lineCount; lineNum++) {
			const line = editor.document.lineAt(lineNum);
			const lineText = line.text;

			const matchingRules: Rule[] = [];
			const appliedRulesSet = new Set<string>();

			for (const rule of rules) {
				let regex: RegExp;
				try {
					regex = rule.isRegex
						? new RegExp(rule.condition, "gi")
						: new RegExp(this.escapeRegExp(rule.condition), "gi");
				} catch {
					vscode.window.showErrorMessage(
						`Invalid regular expression: ${rule.condition}`
					);
					continue;
				}

				let hasMatch = false;
				let match;
				while ((match = regex.exec(lineText)) !== null) {
					hasMatch = true;
					if (!appliedRulesSet.has(rule.condition)) {
						matchingRules.push(rule);
						appliedRulesSet.add(rule.condition);

						if (rule.ruleType === "replacement") {
							replacementCounts[lineNum] =
								(replacementCounts[lineNum] || 0) + 1;
						}
					}

					const startPos = new vscode.Position(lineNum, match.index);
					const endPos = new vscode.Position(
						lineNum,
						match.index + match[0].length
					);
					const matchRange = new vscode.Range(startPos, endPos);

					let matchDecorationType = this.matchDecorationTypes[rule.color];
					if (!matchDecorationType) {
						matchDecorationType = vscode.window.createTextEditorDecorationType({
							backgroundColor: this.applyOpacityToColor(rule.color, 0.5),
							overviewRulerColor: rule.color,
							overviewRulerLane: vscode.OverviewRulerLane.Full,
						});
						this.matchDecorationTypes[rule.color] = matchDecorationType;
					}

					if (!matchDecorationOptionsMap[rule.color]) {
						matchDecorationOptionsMap[rule.color] = [];
					}
					matchDecorationOptionsMap[rule.color].push({ range: matchRange });
				}

				if (hasMatch) {
					const lineRange = line.range;

					let lineDecorationType = this.lineDecorationTypes[rule.color];
					if (!lineDecorationType) {
						lineDecorationType = vscode.window.createTextEditorDecorationType({
							backgroundColor: this.applyOpacityToColor(rule.color, 0.1),
							isWholeLine: true,
							overviewRulerColor: rule.color,
							overviewRulerLane: vscode.OverviewRulerLane.Full,
						});
						this.lineDecorationTypes[rule.color] = lineDecorationType;
					}

					if (!lineDecorationOptionsMap[rule.color]) {
						lineDecorationOptionsMap[rule.color] = [];
					}
					lineDecorationOptionsMap[rule.color].push({ range: lineRange });
				}
			}

			if (matchingRules.length > 0) {
				const lineRange = line.range;

				let marginRight = 4;
				for (const rule of matchingRules) {
					const indicatorColor = rule.color || "gray";
					const icon = rule.ruleType === "annotation" ? "🔍" : "✏️";
					const colorHex = this.rgbToHex(indicatorColor);

					const hoverMessage = new vscode.MarkdownString(
						`![color](https://via.placeholder.com/10/${colorHex}/000000.png) ${icon} ${rule.condition}`
					);
					hoverMessage.isTrusted = true;

					const indicatorOption: vscode.DecorationOptions = {
						range: new vscode.Range(lineRange.end, lineRange.end),
						renderOptions: {
							after: {
								contentText: " ",
								backgroundColor: indicatorColor,
								border: "1px solid black",
								width: "10px",
								height: "10px",
								margin: `0 0 0 ${marginRight}px`,
							},
						},
						hoverMessage: hoverMessage,
					};
					indicatorDecorationOptions.push(indicatorOption);
					marginRight += 6;
				}
			}
		}

		for (const color in lineDecorationOptionsMap) {
			const decorationType = this.lineDecorationTypes[color];
			const options = lineDecorationOptionsMap[color];
			editor.setDecorations(decorationType, options);
		}

		for (const color in matchDecorationOptionsMap) {
			const decorationType = this.matchDecorationTypes[color];
			const options = matchDecorationOptionsMap[color];
			editor.setDecorations(decorationType, options);
		}

		for (const lineNumStr in replacementCounts) {
			const lineNum = parseInt(lineNumStr, 10);
			if (replacementCounts[lineNum] > 1) {
				const lineRange = editor.document.lineAt(lineNum).range;
				const warningOption: vscode.DecorationOptions = {
					range: new vscode.Range(lineRange.end, lineRange.end),
					hoverMessage: "Multiple replacements applied to this line.",
				};
				warningDecorationOptions.push(warningOption);
			}
		}
		editor.setDecorations(this.warningDecorationType, warningDecorationOptions);

		editor.setDecorations(
			this.indicatorDecorationType,
			indicatorDecorationOptions
		);
	}

	// Add all missing methods from the original code here:

	/**
	 * Manages highlight rules by showing a menu and providing options to add, edit or delete rules.
	 */
	public async manageHighlightRules() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const fileUri = editor.document.uri.toString();
		const fsPath = editor.document.uri.fsPath;
		const isPlusFile = fsPath.endsWith("-plus" + path.extname(fsPath));

		while (true) {
			const rules = this.fileRules[fileUri] || [];

			const options: vscode.QuickPickItem[] = rules.map((rule, index) => {
				const icon = rule.ruleType === "annotation" ? "🔍" : "✏️";
				const colorName =
					this.predefinedColors.find((c) => c.value === rule.color)?.display ||
					"Custom Color";
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
				await this.addHighlightRule();
			} else if (selection.label === "Import Rules") {
				await this.importRules();
			} else if (selection.label === "Export Rules") {
				await this.exportRules();
			} else if (selection.label === 'Convert to "-plus"') {
				await this.convertToPlusFile();
			} else if (selection.label === "Revert Changes") {
				await this.revertChanges();
			} else {
				// User selected a rule
				const index = parseInt(selection.label.split(".")[0]) - 1;
				const rulesRef = this.fileRules[fileUri] || [];
				if (index >= 0 && index < rulesRef.length) {
					await this.manageSelectedRule(rulesRef[index], editor);
				}
			}
		}
	}

	private async manageSelectedRule(rule: Rule, editor: vscode.TextEditor) {
		const occurrences = this.findOccurrences(rule, editor.document);
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
			const selection = await vscode.window.showQuickPick(navigateOptions, {
				placeHolder: `Occurrences: ${occurrences.length}. Navigate or manage rule.`,
			});

			if (!selection) {
				break;
			}

			if (selection === "Back") {
				return; // Return to the main rules list
			}

			switch (selection) {
				case "First Occurrence":
					currentIndex = 0;
					this.navigateToOccurrence(occurrences, currentIndex, editor);
					break;
				case "Last Occurrence":
					currentIndex = occurrences.length - 1;
					this.navigateToOccurrence(occurrences, currentIndex, editor);
					break;
				case "Previous Occurrence":
					currentIndex =
						(currentIndex - 1 + occurrences.length) % occurrences.length;
					this.navigateToOccurrence(occurrences, currentIndex, editor);
					break;
				case "Next Occurrence":
					currentIndex = (currentIndex + 1) % occurrences.length;
					this.navigateToOccurrence(occurrences, currentIndex, editor);
					break;
				case "Edit Rule":
					await this.editRule(rule, editor);
					break;
				case "Delete Rule":
					await this.deleteRule(rule, editor);
					return; // After deletion, return to the main rules list
			}
		}
	}

	private navigateToOccurrence(
		occurrences: vscode.Range[],
		index: number,
		editor: vscode.TextEditor
	) {
		if (occurrences.length === 0) {
			vscode.window.showInformationMessage("No occurrences found.");
			return;
		}

		const range = occurrences[index];
		editor.selection = new vscode.Selection(range.start, range.end);
		editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	}

	private findOccurrences(
		rule: Rule,
		document: vscode.TextDocument
	): vscode.Range[] {
		const occurrences: vscode.Range[] = [];
		const regex = rule.isRegex
			? new RegExp(rule.condition, "gi")
			: new RegExp(this.escapeRegExp(rule.condition), "gi");

		for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
			const line = document.lineAt(lineNum);
			const lineText = line.text;

			let match;
			while ((match = regex.exec(lineText)) !== null) {
				const startPos = new vscode.Position(lineNum, match.index);
				const endPos = new vscode.Position(
					lineNum,
					match.index + match[0].length
				);
				const matchRange = new vscode.Range(startPos, endPos);
				occurrences.push(matchRange);
			}
		}

		return occurrences;
	}

	private async editRule(rule: Rule, editor: vscode.TextEditor) {
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
							this.predefinedColors.map((c) => c.display),
							{
								placeHolder: "Select a highlight color",
								canPickMany: false,
								ignoreFocusOut: true,
							}
						);

						if (!colorPick) {
							return;
						}

						const colorObj = this.predefinedColors.find(
							(c) => c.display === colorPick
						);
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

			await this.saveRules();
			this.updateDecorations(editor);

			// For replacement rules, re-apply replacements
			if (rule.ruleType === "replacement") {
				await this.applyReplacementRule(editor, rule);
				this.updateDecorations(editor);
			}
		}
	}

	private async deleteRule(rule: Rule, editor: vscode.TextEditor) {
		const fileUri = editor.document.uri.toString();
		const rules = this.fileRules[fileUri];

		const index = rules.indexOf(rule);
		if (index >= 0) {
			rules.splice(index, 1);
			await this.saveRules();

			if (rule.ruleType === "replacement") {
				await this.restoreOriginalContent(editor, rule);
			}

			this.updateDecorations(editor);
			this.outputChannel.appendLine(`Deleted rule: ${rule.condition}`);
		}
	}

	private async addHighlightRule() {
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
				this.predefinedColors.map((c) => c.display),
				{
					placeHolder: "Select a highlight color",
				}
			);

			if (!colorPick) {
				return;
			}

			colorObj = this.predefinedColors.find((c) => c.display === colorPick);
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

		if (!this.fileRules[fileUri]) {
			this.fileRules[fileUri] = [];
		}

		const newRule: Rule = {
			condition: searchTerm,
			isRegex: isRegex,
			ruleType: ruleType,
			color: colorObj ? colorObj.value : "",
			displayColor: colorObj ? colorObj.display : "",
			replacement: replacement,
		};

		this.fileRules[fileUri].push(newRule);

		await this.saveRules();

		this.updateDecorations(editor);

		if (ruleType === "replacement") {
			await this.applyReplacementRule(editor, newRule);
			this.updateDecorations(editor);
		}

		this.outputChannel.appendLine(`Added new rule: ${searchTerm}`);
	}

	public async exportRules() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const fileUri = editor.document.uri.toString();
		const rules = this.fileRules[fileUri];

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
		this.outputChannel.appendLine("Rules exported.");
	}

	public async importRules() {
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
				this.fileRules[fileUri] = importedRules;
			} else if (action === "Merge") {
				const existingRules = this.fileRules[fileUri] || [];
				const mergedRulesMap: { [condition: string]: Rule } = {};

				for (const rule of existingRules) {
					mergedRulesMap[rule.condition] = rule;
				}
				for (const rule of importedRules) {
					mergedRulesMap[rule.condition] = rule; // Overwrite existing rule with the same condition
				}
				this.fileRules[fileUri] = Object.values(mergedRulesMap);
			}

			await this.saveRules();

			this.updateDecorations(vscode.window.activeTextEditor!);

			vscode.window.showInformationMessage("Rules imported successfully.");
			this.outputChannel.appendLine("Rules imported.");
		} catch (error) {
			vscode.window.showErrorMessage(
				"Failed to import rules: " + (error as Error).message
			);
			this.outputChannel.appendLine(
				"Error importing rules: " + (error as Error).message
			);
		}
	}

	private async applyReplacementRule(editor: vscode.TextEditor, rule: Rule) {
		const document = editor.document;
		const fileUri = document.uri.toString();
		const edit = new vscode.WorkspaceEdit();
		const regex = rule.isRegex
			? new RegExp(rule.condition, "gi")
			: new RegExp(this.escapeRegExp(rule.condition), "gi");

		const originalLines = this.originalContent[fileUri] || {};

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

		this.originalContent[fileUri] = originalLines;
		await this.saveOriginalContent();

		this.outputChannel.appendLine(
			`Applied replacement rule: ${rule.condition}`
		);
	}

	private async restoreOriginalContent(editor: vscode.TextEditor, rule: Rule) {
		const document = editor.document;
		const fileUri = document.uri.toString();
		const originalLines = this.originalContent[fileUri];

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

		delete this.originalContent[fileUri];
		await this.saveOriginalContent();

		this.outputChannel.appendLine(
			`Restored original content for rule: ${rule.condition}`
		);
	}

	public async revertChanges() {
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

			delete this.originalContent[document.uri.toString()];
			await this.saveOriginalContent();
			delete this.fileRules[document.uri.toString()];
			await this.saveRules();

			this.updateDecorations(editor);

			vscode.window.showInformationMessage("Changes reverted successfully.");
			this.outputChannel.appendLine("Reverted changes.");
		} catch (error) {
			vscode.window.showErrorMessage(
				"Failed to revert changes: " + (error as Error).message
			);
			this.outputChannel.appendLine(
				"Error reverting changes: " + (error as Error).message
			);
		}
	}

	private applyOpacityToColor(color: string, opacity: number): string {
		return color.replace(
			/rgba\((\d+), (\d+), (\d+), [^)]+\)/,
			`rgba($1, $2, $3, ${opacity})`
		);
	}

	private rgbToHex(rgba: string): string {
		const parts = rgba.match(/rgba?\((\d+), (\d+), (\d+)/);
		if (!parts) {
			return "ffffff";
		}
		const r = parseInt(parts[1]).toString(16).padStart(2, "0");
		const g = parseInt(parts[2]).toString(16).padStart(2, "0");
		const b = parseInt(parts[3]).toString(16).padStart(2, "0");
		return `${r}${g}${b}`;
	}

	private escapeRegExp(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	public async saveRules() {
		await this.context.workspaceState.update("fileRules", this.fileRules);
		this.outputChannel.appendLine("Rules saved.");
	}

	private loadRules() {
		this.fileRules = this.context.workspaceState.get<FileRules>(
			"fileRules",
			{}
		);
		this.outputChannel.appendLine("Rules loaded.");
	}

	public async saveOriginalContent() {
		await this.context.workspaceState.update(
			"originalContent",
			this.originalContent
		);
		this.outputChannel.appendLine("Original content saved.");
	}

	private loadOriginalContent() {
		this.originalContent = this.context.workspaceState.get<OriginalContent>(
			"originalContent",
			{}
		);
		this.outputChannel.appendLine("Original content loaded.");
	}

	public getPredefinedColors() {
		return this.predefinedColors;
	}

	public getFileRules(fileUri: string): Rule[] {
		return this.fileRules[fileUri] || [];
	}

	public setFileRules(fileUri: string, rules: Rule[]) {
		this.fileRules[fileUri] = rules;
	}

	public getOriginalContent() {
		return this.originalContent;
	}

	public setOriginalContent(content: OriginalContent) {
		this.originalContent = content;
	}

	public getRules(): Rule[] {
		// Aggregate all rules from all files
		const allRules: Rule[] = [];
		for (const rules of Object.values(this.fileRules)) {
			allRules.push(...rules);
		}
		return allRules;
	}

	// Add getContext method
	public getContext(): vscode.ExtensionContext {
		return this.context;
	}
}
