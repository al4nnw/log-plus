import * as vscode from "vscode";
import * as path from "path";
import { ThemeIcon } from "vscode";

let selectedRuleStatusBar: vscode.StatusBarItem;

// TreeDataProvider for displaying open file name and its rules
class OpenFileNameProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<
		vscode.TreeItem | undefined | void
	> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<
		vscode.TreeItem | undefined | void
	> = this._onDidChangeTreeData.event;

	private openFileName: string = "No file";

	constructor(private ruleManager: RuleManager) {
		this.ruleManager.onRuleChanged(() => {
			this._onDidChangeTreeData.fire();
		});
	}

	setOpenFileName(name: string) {
		this.openFileName = name;
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
		if (!element) {
			const fileName = path.basename(this.openFileName);
			const rules = this.ruleManager.getRulesForFile(this.openFileName);

			const searchHeader = new vscode.TreeItem(
				`Searching ${fileName}`,
				vscode.TreeItemCollapsibleState.None
			);
			searchHeader.contextValue = "searchHeader";

			return Promise.resolve([
				searchHeader,
				...rules.map((rule) => this.createRuleItem(rule)),
				this.createAddRuleItem(),
			]);
		}
		return Promise.resolve([]);
	}

	private createAddRuleItem(): vscode.TreeItem {
		const item = new vscode.TreeItem("Search for...");
		item.iconPath = new ThemeIcon("add");
		item.command = {
			command: "logViewer.addRule",
			title: "Add Rule",
		};
		return item;
	}

	private createRuleItem(rule: Rule): vscode.TreeItem {
		const item = new vscode.TreeItem(
			`${rule.condition} (${rule.matchCount})`,
			vscode.TreeItemCollapsibleState.None
		);
		item.iconPath = new ThemeIcon("filter");
		item.contextValue = "rule";
		item.description = rule.displayColor;
		item.tooltip = `Click to select rule: ${rule.condition}`;
		item.command = {
			command: "logViewer.selectRule",
			title: "Select Rule",
			arguments: [rule.condition],
		};
		return item;
	}
}

// TreeDataProvider for navigation buttons and selected rule
class NavigationButtonProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>
{
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private selectedRule: Rule | null = null;

	constructor(private ruleManager: RuleManager) {
		this.ruleManager.onRuleSelected(() => {
			this.selectedRule = this.ruleManager.getSelectedRule();
			this.refresh();
		});

		this.ruleManager.onRuleDeselected(() => {
			this.selectedRule = null;
			this.refresh();
		});
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
		if (!element) {
			const children: vscode.TreeItem[] = [];

			if (this.selectedRule) {
				// Rule actions
				children.push(
					this.createActionItem("Edit Search", "edit", "logViewer.editRule"),
					this.createActionItem(
						"Change Color",
						"paintcan",
						"logViewer.changeColor"
					),
					this.createActionItem("Delete Rule", "trash", "logViewer.deleteRule")
				);
			}

			// Navigation section
			const navParent = new vscode.TreeItem(
				"Navigation",
				vscode.TreeItemCollapsibleState.Expanded
			);
			navParent.iconPath = new ThemeIcon("compass");
			children.push(navParent);

			return Promise.resolve(children);
		} else if (element.label === "Navigation") {
			// Navigation buttons with updated icons
			return Promise.resolve([
				this.createButton("First", "logViewer.firstOccurrence", "arrow-up"),
				this.createButton(
					"Previous",
					"logViewer.previousOccurrence",
					"arrow-left"
				),
				this.createButton("Nearest", "logViewer.nearestOccurrence", "target"),
				this.createButton("Next", "logViewer.nextOccurrence", "arrow-right"),
				this.createButton("Last", "logViewer.lastOccurrence", "arrow-down"),
			]);
		}
		return Promise.resolve([]);
	}

	private createButton(
		label: string,
		command: string,
		icon: string
	): vscode.TreeItem {
		const item = new vscode.TreeItem(
			label,
			vscode.TreeItemCollapsibleState.None
		);
		item.command = { command, title: label };
		item.iconPath = new vscode.ThemeIcon(icon);
		return item;
	}

	private createActionItem(
		label: string,
		icon: string,
		command: string
	): vscode.TreeItem {
		const item = new vscode.TreeItem(
			label,
			vscode.TreeItemCollapsibleState.None
		);
		item.iconPath = new ThemeIcon(icon);
		item.command = {
			command: command,
			title: label,
			arguments: [this.selectedRule],
		};
		return item;
	}
}

// TreeDataProvider for Share panel
class SharePanelProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
		if (!element) {
			// Directly return child items without a parent item
			return Promise.resolve([
				this.createActionItem(
					"Export Rules",
					"cloud-upload",
					"logViewer.exportRules"
				),
				this.createActionItem(
					"Import Rules",
					"cloud-download",
					"logViewer.importRules"
				),
			]);
		}
		return Promise.resolve([]);
	}

	private createActionItem(
		label: string,
		icon: string,
		command: string
	): vscode.TreeItem {
		const item = new vscode.TreeItem(
			label,
			vscode.TreeItemCollapsibleState.None
		);
		item.iconPath = new ThemeIcon(icon);
		item.command = { command, title: label };
		return item;
	}
}

export function activate(context: vscode.ExtensionContext) {
	const ruleManager = new RuleManager(context);
	ruleManager.migrateRulesToAnnotations();

	// Create and show the selected rule status bar
	selectedRuleStatusBar = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	selectedRuleStatusBar.text = "Selected Rule: None";
	selectedRuleStatusBar.show();
	context.subscriptions.push(selectedRuleStatusBar);

	// Register the command for selecting a rule
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"logViewer.selectRule",
			async (ruleName: string) => {
				selectedRuleStatusBar.text = `Selected Rule: ${ruleName}`;
				await ruleManager.selectRule(ruleName);
				// Refresh the navigation panel
				navigationButtonProvider.refresh();
			}
		)
	);

	// Register other commands
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

	// Handle active editor changes
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor) {
				ruleManager.triggerUpdateDecorations(editor);
			}
		})
	);

	// Handle text document changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			const editor = vscode.window.activeTextEditor;
			if (editor && event.document === editor.document) {
				ruleManager.triggerUpdateDecorations(editor);
			}
		})
	);

	// Initial decoration update
	if (vscode.window.activeTextEditor) {
		ruleManager.triggerUpdateDecorations(vscode.window.activeTextEditor);
	}

	// Register a single TreeDataProvider
	const openFileNameProvider = new OpenFileNameProvider(ruleManager);
	vscode.window.registerTreeDataProvider(
		"logViewer.rulesPanel",
		openFileNameProvider
	);

	const navigationButtonProvider = new NavigationButtonProvider(ruleManager);
	vscode.window.registerTreeDataProvider(
		"logViewer.navigation",
		navigationButtonProvider
	);

	// Subscribe to rule changes to refresh the rules panel
	ruleManager.onRuleChanged(() => {
		// Refresh the rules panel
		openFileNameProvider.setOpenFileName(
			vscode.window.activeTextEditor
				? vscode.window.activeTextEditor.document.uri.toString()
				: "No file"
		);
	});

	// Set initial open file name
	const editor = vscode.window.activeTextEditor;
	openFileNameProvider.setOpenFileName(
		editor ? editor.document.uri.toString() : "No file"
	);

	// Update open file name on active editor change
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			openFileNameProvider.setOpenFileName(
				editor ? editor.document.uri.toString() : "No file"
			);
		})
	);

	// Register navigation commands
	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.firstOccurrence", () => {
			ruleManager.navigateToFirstOccurrence();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.lastOccurrence", () => {
			ruleManager.navigateToLastOccurrence();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.nearestOccurrence", () => {
			ruleManager.navigateToNearestOccurrence();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.nextOccurrence", () => {
			ruleManager.navigateToNextOccurrence();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.previousOccurrence", () => {
			ruleManager.navigateToPreviousOccurrence();
		})
	);

	// Step 3: Enable/Disable navigation buttons based on rule selection
	// (Handled within NavigationButtonProvider based on RuleManager events)

	// Register new commands
	context.subscriptions.push(
		vscode.commands.registerCommand("logViewer.addRule", async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const searchTerm = await vscode.window.showInputBox({
				prompt: "Enter search term or pattern",
				placeHolder: "Search term (add /slashes/ for regex)",
				title: "New Highlight Rule",
			});

			if (searchTerm) {
				const isRegex = searchTerm.startsWith("/") && searchTerm.endsWith("/");
				const condition = isRegex ? searchTerm.slice(1, -1) : searchTerm;
				const fileUri = editor.document.uri.toString();

				// Get random color
				const colors = ruleManager.predefinedColors;
				const usedColors = ruleManager
					.getRulesForFile(fileUri)
					.map((r) => r.color);
				const availableColors = colors.filter(
					(c) => !usedColors.includes(c.value)
				);
				const randomColor =
					availableColors.length > 0
						? availableColors[
								Math.floor(Math.random() * availableColors.length)
						  ]
						: colors[Math.floor(Math.random() * colors.length)];

				const newRule: Rule = {
					condition: condition,
					color: randomColor.value,
					displayColor: randomColor.display,
					isRegex: isRegex,
					matchCount: 0,
				};

				if (!ruleManager.fileRules[fileUri]) {
					ruleManager.fileRules[fileUri] = [];
				}
				ruleManager.fileRules[fileUri].push(newRule);
				await ruleManager.saveRules();
				ruleManager.triggerUpdateDecorations(editor);
				ruleManager.ruleChangedEmitter.fire();
				openFileNameProvider.setOpenFileName(editor.document.uri.toString());
			}
		}),

		vscode.commands.registerCommand(
			"logViewer.editRule",
			async (rule: Rule) => {
				const newCondition = await vscode.window.showInputBox({
					prompt: "Edit rule pattern",
					value: rule.condition,
					placeHolder: "Enter new pattern",
				});

				// Check if the new condition is empty
				if (newCondition === undefined || newCondition.trim() === "") {
					vscode.window.showWarningMessage("Rule condition cannot be empty.");
					return;
				}

				rule.condition = newCondition;
				await ruleManager.saveRules();
				ruleManager.triggerUpdateDecorations(vscode.window.activeTextEditor!);
			}
		),

		vscode.commands.registerCommand(
			"logViewer.changeColor",
			async (rule: Rule) => {
				const colorPick = await vscode.window.showQuickPick(
					ruleManager.predefinedColors.map((c) => c.display),
					{ placeHolder: "Select new color" }
				);
				if (colorPick) {
					const colorObj = ruleManager.predefinedColors.find(
						(c) => c.display === colorPick
					);
					if (colorObj) {
						rule.color = colorObj.value;
						rule.displayColor = colorObj.display;
						await ruleManager.saveRules();
						ruleManager.triggerUpdateDecorations(
							vscode.window.activeTextEditor!
						);
					}
				}
			}
		),

		vscode.commands.registerCommand(
			"logViewer.deleteRule",
			async (rule: Rule) => {
				const editor = vscode.window.activeTextEditor!;
				const fileUri = editor.document.uri.toString();
				ruleManager.fileRules[fileUri] = ruleManager.fileRules[fileUri].filter(
					(r) => r !== rule
				);
				await ruleManager.saveRules();
				ruleManager.triggerUpdateDecorations(editor);

				// Refresh views
				openFileNameProvider.setOpenFileName(fileUri);
				navigationButtonProvider.refresh();

				// Select first rule if available
				const rules = ruleManager.getRulesForFile(fileUri);
				if (rules.length > 0) {
					await vscode.commands.executeCommand(
						"logViewer.selectRule",
						rules[0].condition
					);
				} else {
					await vscode.commands.executeCommand("logViewer.deselectRule");
				}
			}
		),

		vscode.commands.registerCommand("logViewer.deselectRule", async () => {
			selectedRuleStatusBar.text = "Selected Rule: None";
			ruleManager.deselectRule();
			// Refresh the navigation panel
			navigationButtonProvider.refresh();
		}),

		vscode.commands.registerCommand("logViewer.addSelectedText", async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const fileUri = editor.document.uri.toString();

			const selection = editor.selection;
			if (selection.isEmpty) {
				vscode.window.showWarningMessage("No text selected");
				return;
			}

			const selectedText = editor.document.getText(selection);
			const colors = ruleManager.predefinedColors;
			const usedColors = ruleManager
				.getRulesForFile(fileUri)
				.map((r) => r.color);
			const availableColors = colors.filter(
				(c) => !usedColors.includes(c.value)
			);
			const randomColor =
				availableColors.length > 0
					? availableColors[Math.floor(Math.random() * availableColors.length)]
					: colors[Math.floor(Math.random() * colors.length)];

			const newRule: Rule = {
				condition: selectedText,
				color: randomColor.value,
				displayColor: randomColor.display,
				isRegex: false,
				matchCount: 0,
			};

			if (!ruleManager.fileRules[fileUri]) {
				ruleManager.fileRules[fileUri] = [];
			}
			ruleManager.fileRules[fileUri].push(newRule);
			await ruleManager.saveRules();
			ruleManager.triggerUpdateDecorations(editor);

			// Refresh views
			openFileNameProvider.setOpenFileName(fileUri);
			navigationButtonProvider.refresh();
		}),

		vscode.commands.registerCommand("logViewer.refreshRules", async () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				ruleManager.triggerUpdateDecorations(editor);

				if (ruleManager.selectedRule) {
					ruleManager.currentMatches = ruleManager.findOccurrences(
						ruleManager.selectedRule,
						editor.document
					);
					ruleManager.currentIndex = -1;
				}

				openFileNameProvider.setOpenFileName(editor.document.uri.toString());
			}
		})
	);

	// Register the new SharePanelProvider
	const sharePanelProvider = new SharePanelProvider();
	vscode.window.registerTreeDataProvider(
		"logViewer.sharePanel",
		sharePanelProvider
	);
}

export function deactivate() {
	// Clean up resources if necessary
}

interface Rule {
	condition: string;
	color: string;
	displayColor: string;
	isRegex: boolean;
	matchCount: number;
}

interface FileRules {
	[filePath: string]: Rule[];
}

export class RuleManager {
	fileRules: FileRules = {};
	lineDecorationTypes: {
		[color: string]: vscode.TextEditorDecorationType;
	} = {};
	matchDecorationTypes: {
		[color: string]: vscode.TextEditorDecorationType;
	} = {};
	indicatorDecorationType: vscode.TextEditorDecorationType;
	updateTimeout: NodeJS.Timeout | undefined = undefined;
	context: vscode.ExtensionContext;
	predefinedColors: { name: string; value: string; display: string }[] = [
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

	outputChannel: vscode.OutputChannel;

	currentMatches: vscode.Range[] = [];
	currentIndex: number = -1;
	ruleSelectedEmitter: vscode.EventEmitter<void> =
		new vscode.EventEmitter<void>();
	ruleDeselectedEmitter: vscode.EventEmitter<void> =
		new vscode.EventEmitter<void>();

	selectedRule: Rule | null = null;

	// Inside the RuleManager class, add a new EventEmitter for rule changes
	ruleChangedEmitter: vscode.EventEmitter<void> =
		new vscode.EventEmitter<void>();
	public readonly onRuleChanged: vscode.Event<void> =
		this.ruleChangedEmitter.event;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Initialize output channel before loading rules
		this.outputChannel = vscode.window.createOutputChannel("LogViewer");
		this.outputChannel.appendLine("Extension activated.");

		this.loadRules();

		// Create the indicator decoration type once
		this.indicatorDecorationType = vscode.window.createTextEditorDecorationType(
			{
				after: {
					margin: "0 0 0 4px",
				},
				overviewRulerColor: "gray",
				overviewRulerLane: vscode.OverviewRulerLane.Center,
			}
		);
	}

	/**
	 * Retrieves the currently selected rule.
	 * @returns The selected Rule or null if none is selected.
	 */
	public getSelectedRule(): Rule | null {
		return this.selectedRule;
	}

	/**
	 * Manages highlight rules.
	 */
	async manageHighlightRules() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const fileUri = editor.document.uri.toString();

		const options: vscode.QuickPickItem[] = this.fileRules[fileUri].map(
			(rule, index) => {
				const colorName =
					this.predefinedColors.find((c) => c.value === rule.color)?.display ||
					"Custom Color";
				return {
					label: `${index + 1}. ■ 🔍 ${rule.condition}`,
					description: `${colorName}`,
				};
			}
		);

		options.push(
			{ label: "Add a new rule", description: "" },
			{ label: "Import Rules", description: "" },
			{ label: "Export Rules", description: "" },
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
		} else {
			// User selected a rule
			const index = parseInt(selection.label.split(".")[0]) - 1;
			if (index >= 0 && index < this.fileRules[fileUri].length) {
				await this.manageSelectedRule(this.fileRules[fileUri][index], editor);
			}
		}
	}

	/**
	 * Manages a selected rule, allowing navigation and editing.
	 * @param rule The selected rule.
	 * @param editor The active text editor.
	 */
	private async manageSelectedRule(rule: Rule, editor: vscode.TextEditor) {
		this.currentMatches = this.findOccurrences(rule, editor.document);
		this.currentIndex = -1;
		this.selectedRule = rule;
		this.ruleSelectedEmitter.fire();
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

	/**
	 * Navigates to a specific occurrence in the editor.
	 * @param occurrences Array of ranges where the rule matches.
	 * @param index Index of the occurrence to navigate to.
	 * @param editor The active text editor.
	 */
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

	/**
	 * Finds all occurrences of a rule in the document.
	 * @param rule The rule to search for.
	 * @param document The text document.
	 * @returns An array of ranges where the rule matches.
	 */
	findOccurrences(rule: Rule, document: vscode.TextDocument): vscode.Range[] {
		const occurrences: vscode.Range[] = [];
		const regex = rule.isRegex
			? new RegExp(rule.condition, "gi")
			: new RegExp(this.escapeRegExp(rule.condition), "gi");

		rule.matchCount = 0; // Reset matchCount before counting

		for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
			const line = document.lineAt(lineNum);
			const lineText = line.text;

			let match;
			while ((match = regex.exec(lineText)) !== null) {
				rule.matchCount += 1; // Increment matchCount
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

	/**
	 * Edits a rule.
	 * @param rule The rule to edit.
	 * @param editor The active text editor.
	 */
	async editRule(rule: Rule, editor: vscode.TextEditor) {
		while (true) {
			const editOptions = [
				"Change Condition",
				"Toggle Regex",
				"Change Color",
				"Back",
			];
			const selection = await vscode.window.showQuickPick(editOptions, {
				placeHolder: "Select an option to edit the rule",
			});

			if (!selection || selection === "Back") {
				break;
			}

			switch (selection) {
				case "Change Condition":
					const newSearchTerm = await vscode.window.showInputBox({
						prompt: "Enter the new search term or pattern",
						value: rule.condition,
					});

					if (newSearchTerm === undefined || newSearchTerm.trim() === "") {
						return;
					}

					rule.condition = newSearchTerm;
					break;

				case "Toggle Regex":
					rule.isRegex = !rule.isRegex;
					break;

				case "Change Color":
					const colorPick = await vscode.window.showQuickPick(
						this.predefinedColors.map((c) => c.display),
						{ placeHolder: "Select a highlight color" }
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
					break;
			}

			await this.saveRules();
			await this.updateDecorationsWithProgress(editor);
		}
	}

	/**
	 * Deletes a rule.
	 * @param rule The rule to delete.
	 * @param editor The active text editor.
	 */
	private async deleteRule(rule: Rule, editor: vscode.TextEditor) {
		const fileUri = editor.document.uri.toString();
		const rules = this.fileRules[fileUri];

		const index = rules.indexOf(rule);
		if (index >= 0) {
			rules.splice(index, 1);
			await this.saveRules();
			await this.updateDecorationsWithProgress(editor);

			this.outputChannel.appendLine(`Deleted rule: ${rule.condition}`);
		}
		this.ruleDeselectedEmitter.fire();
		this.ruleChangedEmitter.fire();
	}

	/**
	 * Adds a new highlight rule.
	 */
	private async addHighlightRule() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const fileUri = editor.document.uri.toString();

		const searchTerm = await vscode.window.showInputBox({
			prompt: "Enter the search term or pattern",
			placeHolder: "Search term",
		});

		if (searchTerm === undefined || searchTerm.trim() === "") {
			return;
		}

		const isRegex = searchTerm.startsWith("/") && searchTerm.endsWith("/");
		const condition = isRegex ? searchTerm.slice(1, -1) : searchTerm;

		// Get random color
		const colors = this.predefinedColors;
		const usedColors = this.getRulesForFile(fileUri).map((r) => r.color);
		const availableColors = colors.filter((c) => !usedColors.includes(c.value));
		const randomColor =
			availableColors.length > 0
				? availableColors[Math.floor(Math.random() * availableColors.length)]
				: colors[Math.floor(Math.random() * colors.length)];

		const newRule: Rule = {
			condition: condition,
			color: randomColor.value,
			displayColor: randomColor.display,
			isRegex: isRegex,
			matchCount: 0,
		};

		if (!this.fileRules[fileUri]) {
			this.fileRules[fileUri] = [];
		}

		this.fileRules[fileUri].push(newRule);

		// After applying rules, update matchCount
		for (const rule of this.fileRules[fileUri]) {
			rule.matchCount = this.findOccurrences(rule, editor.document).length;
		}

		await this.saveRules();

		// Emit the rule changed event
		this.ruleChangedEmitter.fire();

		// Show loading indicator when processing
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Window,
				title: "Applying rules...",
			},
			async () => {
				await this.updateDecorationsWithProgress(editor);
			}
		);

		this.outputChannel.appendLine(`Added new rule: ${searchTerm}`);

		// Close the dialog after adding the rule
		vscode.commands.executeCommand("workbench.action.closeQuickOpen");
	}

	/**
	 * Exports the current rules to a JSON file.
	 */
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

	/**
	 * Imports rules from a JSON file.
	 */
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
					mergedRulesMap[rule.condition] = rule; // Overwrite
				}
				this.fileRules[fileUri] = Object.values(mergedRulesMap);
			}

			await this.saveRules();

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Window,
					title: "Applying rules...",
				},
				async () => {
					await this.updateDecorationsWithProgress(editor);
				}
			);

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

	/**
	 * Updates the decorations (highlighting) in the editor with a loading indicator.
	 * @param editor The text editor to update.
	 */
	private async updateDecorationsWithProgress(editor: vscode.TextEditor) {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Window,
				title: "Applying rules...",
			},
			async (progress) => {
				await this.updateDecorations(editor, progress);
			}
		);
	}

	/**
	 * Updates the decorations (highlighting) in the editor.
	 * Processes the entire file and adds overview ruler marks.
	 * @param editor The text editor to update.
	 * @param progress Optional progress indicator.
	 */
	private async updateDecorations(
		editor: vscode.TextEditor,
		progress?: vscode.Progress<{
			message?: string;
			increment?: number;
		}>
	) {
		// Reset match counts before processing
		const fileUri = editor.document.uri.toString();
		if (this.fileRules[fileUri]) {
			this.fileRules[fileUri].forEach((rule) => (rule.matchCount = 0));
		}

		const rules = this.fileRules[fileUri];

		// Clear decorations if no rules
		if (!rules || rules.length === 0) {
			for (const decorationType of Object.values(this.lineDecorationTypes)) {
				editor.setDecorations(decorationType, []);
			}
			for (const decorationType of Object.values(this.matchDecorationTypes)) {
				editor.setDecorations(decorationType, []);
			}
			editor.setDecorations(this.indicatorDecorationType, []);
			return;
		}

		for (const decorationType of Object.values(this.lineDecorationTypes)) {
			editor.setDecorations(decorationType, []);
		}
		for (const decorationType of Object.values(this.matchDecorationTypes)) {
			editor.setDecorations(decorationType, []);
		}
		editor.setDecorations(this.indicatorDecorationType, []);

		const indicatorDecorationOptions: vscode.DecorationOptions[] = [];
		const lineDecorationOptionsMap: {
			[color: string]: vscode.DecorationOptions[];
		} = {};
		const matchDecorationOptionsMap: {
			[color: string]: vscode.DecorationOptions[];
		} = {};

		const lineCount = editor.document.lineCount;

		for (let lineNum = 0; lineNum < lineCount; lineNum++) {
			const line = editor.document.lineAt(lineNum);
			const lineText = line.text;

			// Update progress
			if (progress && lineNum % 50 === 0) {
				progress.report({
					message: `Processing line ${lineNum + 1} of ${lineCount}`,
					increment: (lineNum / lineCount) * 100,
				});
			}

			const matchingRules: Rule[] = [];
			const appliedRulesSet = new Set<string>();
			const lineRulesSet = new Set<string>(); // Track rules that already contributed to this line

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

						// Increment match count for the rule
						rule.matchCount++;
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
			}

			// After processing all rules for the line, add indicators
			const uniqueRules = Array.from(
				new Set(matchingRules.map((r) => r.condition))
			);
			let marginRight = 4;

			for (const ruleCondition of uniqueRules) {
				const rule = matchingRules.find((r) => r.condition === ruleCondition);
				if (!rule) continue;

				const indicatorColor = rule.color || "gray";
				const colorHex = this.rgbToHex(indicatorColor);

				const indicatorOption: vscode.DecorationOptions = {
					range: new vscode.Range(line.range.end, line.range.end),
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
				};
				indicatorDecorationOptions.push(indicatorOption);
				marginRight += 6;
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

		editor.setDecorations(
			this.indicatorDecorationType,
			indicatorDecorationOptions
		);
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

	triggerUpdateDecorations(editor: vscode.TextEditor) {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}
		this.updateTimeout = setTimeout(() => {
			this.updateDecorationsWithProgress(editor);
		}, 300);
	}

	private escapeRegExp(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	async saveRules() {
		await this.context.workspaceState.update("fileRules", this.fileRules);
		this.outputChannel.appendLine("Rules saved.");
	}

	loadRules() {
		this.fileRules = this.context.workspaceState.get<FileRules>(
			"fileRules",
			{}
		);
		this.outputChannel.appendLine("Rules loaded.");
	}

	// Retrieve rules for a specific file
	public getRulesForFile(filePath: string): Rule[] {
		return this.fileRules[filePath] || [];
	}

	// Navigation methods
	public navigateToFirstOccurrence() {
		if (this.currentMatches.length > 0) {
			this.currentIndex = 0;
			this.navigateToMatch(this.currentMatches[this.currentIndex]);
		} else {
			vscode.window.showInformationMessage("No occurrences to navigate.");
		}
	}

	public navigateToLastOccurrence() {
		if (this.currentMatches.length > 0) {
			this.currentIndex = this.currentMatches.length - 1;
			this.navigateToMatch(this.currentMatches[this.currentIndex]);
		} else {
			vscode.window.showInformationMessage("No occurrences to navigate.");
		}
	}

	public navigateToNearestOccurrence() {
		const editor = vscode.window.activeTextEditor;
		if (editor && this.currentMatches.length > 0) {
			const cursorPosition = editor.selection.active;
			let nearest = 0;
			let minDistance = Number.MAX_VALUE;
			this.currentMatches.forEach((range, index) => {
				const distance = Math.abs(range.start.line - cursorPosition.line);
				if (distance < minDistance) {
					minDistance = distance;
					nearest = index;
				}
			});
			this.currentIndex = nearest;
			this.navigateToMatch(this.currentMatches[this.currentIndex]);
		} else {
			vscode.window.showInformationMessage("No occurrences to navigate.");
		}
	}

	public navigateToNextOccurrence() {
		if (this.currentMatches.length > 0) {
			this.currentIndex = (this.currentIndex + 1) % this.currentMatches.length;
			this.navigateToMatch(this.currentMatches[this.currentIndex]);
		} else {
			vscode.window.showInformationMessage("No occurrences to navigate.");
		}
	}

	public navigateToPreviousOccurrence() {
		if (this.currentMatches.length > 0) {
			this.currentIndex =
				(this.currentIndex - 1 + this.currentMatches.length) %
				this.currentMatches.length;
			this.navigateToMatch(this.currentMatches[this.currentIndex]);
		} else {
			vscode.window.showInformationMessage("No occurrences to navigate.");
		}
	}

	private navigateToMatch(range: vscode.Range) {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			editor.selection = new vscode.Selection(range.start, range.end);
			editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
		}
	}

	// Event handlers for rule selection and deselection
	public onRuleSelected(callback: () => void) {
		this.ruleSelectedEmitter.event(callback);
	}

	public onRuleDeselected(callback: () => void) {
		this.ruleDeselectedEmitter.event(callback);
	}

	/**
	 * Selects a rule, finds occurrences, and updates state.
	 * @param ruleName The name of the rule to select.
	 */
	public async selectRule(ruleName: string) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}

		const document = editor.document;
		const rule = this.getRulesForFile(document.uri.toString()).find(
			(r) => r.condition === ruleName
		);
		if (!rule) {
			vscode.window.showErrorMessage(`Rule "${ruleName}" not found.`);
			return;
		}

		this.selectedRule = rule;
		this.currentMatches = this.findOccurrences(rule, document);
		this.currentIndex = -1;

		if (this.currentMatches.length === 0) {
			vscode.window.showInformationMessage(
				`No matches found for rule "${ruleName}".`
			);
		} else {
			vscode.window.showInformationMessage(
				`Found ${this.currentMatches.length} matches for rule "${ruleName}".`
			);
		}

		this.ruleSelectedEmitter.fire();
	}

	/**
	 * Deselects the currently selected rule.
	 */
	public deselectRule() {
		this.selectedRule = null;
		this.currentMatches = [];
		this.currentIndex = -1;
		this.ruleDeselectedEmitter.fire();
	}

	public migrateRulesToAnnotations() {
		for (const fileUri in this.fileRules) {
			this.fileRules[fileUri] = this.fileRules[fileUri].map((rule) => {
				// Remove any legacy replacement field references
				const { ...rest } = rule;
				return rest;
			});
		}
		this.saveRules();
	}
}
