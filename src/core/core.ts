// core/core.ts

import * as vscode from "vscode";
import * as path from "path";
import {
	applyHighlightRuleFunctions,
	applyImportExportFunctions,
	applyRevertConvertFunctions,
} from "../core/highlightLogic";
// In future, we might import flameGraphLogic as well.

export interface Rule {
	condition: string;
	color: string;
	displayColor: string; // For display purposes in the UI
	isRegex: boolean;
	replacement?: string; // For replacement rules
	ruleType: "annotation" | "replacement";
}

export interface FileRules {
	[filePath: string]: Rule[];
}

export interface OriginalContent {
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

		// Apply highlight logic functions to this instance
		applyHighlightRuleFunctions(this);
		applyImportExportFunctions(this);
		applyRevertConvertFunctions(this);
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

		const duplicate = await vscode.window.showInformationMessage(
			"Do you want to work on a duplicate of this file to avoid modifying the original?",
			"Yes",
			"No"
		);

		if (duplicate === "Yes") {
			await this.convertToPlusFile(); // This method now exists as a delegate after applyRevertConvertFunctions
		}
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

	// Utility methods
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

	// Accessors
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

	public getContext() {
		return this.context;
	}

	public getOutputChannel() {
		return this.outputChannel;
	}

	// Core utilities for colors and regex
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

	// Delegation to highlight logic functions (so highlightCommands.ts works unchanged)
	// These methods now just delegate to logic defined in highlightLogic.ts
	public async manageHighlightRules() {
		return this._manageHighlightRules(this);
	}

	public async exportRules() {
		return this._exportRules(this);
	}

	public async importRules() {
		return this._importRules(this);
	}

	public async revertChanges() {
		return this._revertChanges(this);
	}

	public async convertToPlusFile(document?: vscode.TextDocument) {
		return this._convertToPlusFile(this, document);
	}

	// For line occurrences etc. used by highlight logic
	public findOccurrences(
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

	// We'll allow highlightLogic.ts to set these function references when we call applyHighlightRuleFunctions, etc.
	// They will store references to the highlight logic functions.
	public _manageHighlightRules!: (rm: RuleManager) => Promise<void>;
	public _exportRules!: (rm: RuleManager) => Promise<void>;
	public _importRules!: (rm: RuleManager) => Promise<void>;
	public _revertChanges!: (rm: RuleManager) => Promise<void>;
	public _convertToPlusFile!: (
		rm: RuleManager,
		document?: vscode.TextDocument
	) => Promise<void>;

	// Similarly for other highlight logic like editing, adding, deleting rules, these could be added if needed.
	public applyReplacementRule!: (
		editor: vscode.TextEditor,
		rule: Rule
	) => Promise<void>;
	public restoreOriginalContent!: (
		editor: vscode.TextEditor,
		rule: Rule
	) => Promise<void>;
	public addHighlightRule!: (rm: RuleManager) => Promise<void>;
	public editRule!: (
		rm: RuleManager,
		rule: Rule,
		editor: vscode.TextEditor
	) => Promise<void>;
	public deleteRule!: (
		rm: RuleManager,
		rule: Rule,
		editor: vscode.TextEditor
	) => Promise<void>;
	public navigateToOccurrence!: (
		rm: RuleManager,
		occurrences: vscode.Range[],
		index: number,
		editor: vscode.TextEditor
	) => void;
	public getRules!: () => Rule[];
}
