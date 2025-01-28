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
				`${fileName}`,
				vscode.TreeItemCollapsibleState.None
			);
			searchHeader.contextValue = "searchHeader";

			// Add the "+ Add Search" button
			const addSearchItem = new vscode.TreeItem("Add Search");
			addSearchItem.iconPath = new ThemeIcon("add");
			addSearchItem.command = {
				command: "logViewer.addNewSearch",
				title: "Add New Search",
			};

			return Promise.resolve([
				searchHeader,
				addSearchItem, // Add the new button here
				...rules.map((rule) => this.createRuleItem(rule)),
			]);
		}
		return Promise.resolve([]);
	}

	private createRuleItem(rule: Rule): vscode.TreeItem {
		const item = new vscode.TreeItem(
			`${rule.condition} (${rule.matchCount})`,
			vscode.TreeItemCollapsibleState.None
		);

		// Replace the ThemeIcon with a color block
		const svg = `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
			<rect width="16" height="16" fill="${rule.color}"/>
		</svg>`.replace(/\n/g, "");
		const encodedSvg = encodeURIComponent(svg);
		item.iconPath = vscode.Uri.parse(`data:image/svg+xml;utf8,${encodedSvg}`);

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
		vscode.commands.registerCommand(
			"logViewer.editRule",
			async (rule: Rule) => {
				const newCondition = await vscode.window.showInputBox({
					prompt: "Edit search term",
					value: rule.condition,
					placeHolder: "Enter new search term",
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
						rule._dirty = true;
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
			const existingRules = ruleManager.getRulesForFile(fileUri);
			const existingRule = existingRules.find(
				(r) => r.condition === selectedText
			);

			if (existingRule) {
				// Remove existing rule
				ruleManager.fileRules[fileUri] = existingRules.filter(
					(r) => r !== existingRule
				);
				await ruleManager.saveRules();
				ruleManager.triggerUpdateDecorations(editor);

				// Check if removed rule was selected
				if (ruleManager.selectedRule === existingRule) {
					await vscode.commands.executeCommand("logViewer.deselectRule");
				}

				vscode.window.showInformationMessage(`Rule "${selectedText}" removed`);
			} else {
				// Add new rule
				const colors = ruleManager.predefinedColors;
				const usedColors = existingRules.map((r) => r.color);
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
					condition: selectedText,
					color: randomColor.value,
					displayColor: randomColor.display,
					isRegex: false,
					matchCount: 0,
					_compiled: undefined,
					_dirty: true,
				};

				if (!ruleManager.fileRules[fileUri]) {
					ruleManager.fileRules[fileUri] = [];
				}
				ruleManager.fileRules[fileUri].push(newRule);
				await ruleManager.saveRules();
				ruleManager.triggerUpdateDecorations(editor);
				vscode.window.showInformationMessage(`Rule "${selectedText}" added`);
			}

			// Refresh views
			openFileNameProvider.setOpenFileName(fileUri);
			navigationButtonProvider.refresh();
		}),

		vscode.commands.registerCommand("logViewer.refreshRules", async () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				ruleManager.triggerUpdateDecorations(editor);

				if (ruleManager.selectedRule) {
					ruleManager.currentMatches = await ruleManager.findOccurrences(
						ruleManager.selectedRule,
						editor.document
					);
					ruleManager.currentIndex = -1;
				}

				openFileNameProvider.setOpenFileName(editor.document.uri.toString());
			}
		}),

		vscode.commands.registerCommand("logViewer.clearAllRules", async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage("No active text editor");
				return;
			}

			const fileUri = editor.document.uri.toString();
			if (
				!ruleManager.fileRules[fileUri] ||
				ruleManager.fileRules[fileUri].length === 0
			) {
				vscode.window.showInformationMessage("No rules to clear for this file");
				return;
			}

			// Remove the confirmation dialog
			delete ruleManager.fileRules[fileUri];
			await ruleManager.saveRules();
			ruleManager.triggerUpdateDecorations(editor);

			// Deselect any selected rule
			await vscode.commands.executeCommand("logViewer.deselectRule");

			// Refresh views
			openFileNameProvider.setOpenFileName(fileUri);
			navigationButtonProvider.refresh();

			vscode.window.showInformationMessage("All rules cleared for this file");
		}),

		vscode.commands.registerCommand("logViewer.addNewSearch", async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const searchTerm = await vscode.window.showInputBox({
				prompt: "Enter search term",
				placeHolder: "Text to search for",
			});

			if (!searchTerm) return;

			const fileUri = editor.document.uri.toString();
			const existingRules = ruleManager.getRulesForFile(fileUri);

			// Check if rule already exists
			if (existingRules.some((r) => r.condition === searchTerm)) {
				vscode.window.showWarningMessage(`Rule "${searchTerm}" already exists`);
				return;
			}

			// Add new rule (similar to addSelectedText logic)
			const colors = ruleManager.predefinedColors;
			const usedColors = existingRules.map((r) => r.color);
			const availableColors = colors.filter(
				(c) => !usedColors.includes(c.value)
			);
			const randomColor =
				availableColors.length > 0
					? availableColors[Math.floor(Math.random() * availableColors.length)]
					: colors[Math.floor(Math.random() * colors.length)];

			const newRule: Rule = {
				condition: searchTerm,
				color: randomColor.value,
				displayColor: randomColor.display,
				isRegex: false,
				matchCount: 0,
				_compiled: undefined,
				_dirty: true,
			};

			if (!ruleManager.fileRules[fileUri]) {
				ruleManager.fileRules[fileUri] = [];
			}
			ruleManager.fileRules[fileUri].push(newRule);
			await ruleManager.saveRules();
			ruleManager.triggerUpdateDecorations(editor);

			vscode.window.showInformationMessage(`Added search for "${searchTerm}"`);

			// Refresh views
			openFileNameProvider.setOpenFileName(fileUri);
			navigationButtonProvider.refresh();
		}),

		vscode.commands.registerCommand("logViewer.toggleFilter", () => {
			ruleManager.toggleFilter();
		}),

		vscode.commands.registerCommand(
			"logViewer.changeSelectedRule",
			async (args: string) => {
				const direction = args === "previous" ? "previous" : "next";
				const editor = vscode.window.activeTextEditor;
				if (!editor) return;

				const fileUri = editor.document.uri.toString();
				const rules = ruleManager.getRulesForFile(fileUri);

				if (rules.length === 0) {
					vscode.window.showWarningMessage("No rules available to select");
					return;
				}

				const currentRule = ruleManager.getSelectedRule();
				let currentIndex = currentRule
					? rules.findIndex((r) => r.condition === currentRule.condition)
					: -1;

				// If no rule selected, start at first/last based on direction
				if (currentIndex === -1) {
					currentIndex = direction === "next" ? -1 : rules.length;
				}

				// Calculate new index
				let newIndex =
					direction === "next"
						? (currentIndex + 1) % rules.length
						: (currentIndex - 1 + rules.length) % rules.length;

				// Select the new rule
				await vscode.commands.executeCommand(
					"logViewer.selectRule",
					rules[newIndex].condition
				);
			}
		)
	);

	// Register the new SharePanelProvider
	const sharePanelProvider = new SharePanelProvider();
	vscode.window.registerTreeDataProvider(
		"logViewer.sharePanel",
		sharePanelProvider
	);

	// After initializing ruleManager
	vscode.commands.executeCommand(
		"setContext",
		"logViewer.filterActive",
		ruleManager.filterActive
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
	_compiled?: RegExp;
	_dirty?: boolean;
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
		{ name: "Gold", value: "#FFD700", display: "Gold" },
		{ name: "LimeGreen", value: "#32CD32", display: "Lime Green" },
		{ name: "Crimson", value: "#DC143C", display: "Crimson" },
		{ name: "DodgerBlue", value: "#1E90FF", display: "Dodger Blue" },
		{ name: "DarkKhaki", value: "#BDB76B", display: "Dark Khaki" },
		{ name: "Orchid", value: "#DA70D6", display: "Orchid" },
		{ name: "Coral", value: "#FF7F50", display: "Coral" },
		{ name: "MediumSeaGreen", value: "#3CB371", display: "Medium Sea Green" },
		{ name: "CadetBlue", value: "#5F9EA0", display: "Cadet Blue" },
		{ name: "SlateBlue", value: "#6A5ACD", display: "Slate Blue" },
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

	// Add precompiled regex cache
	private regexCache: Map<string, RegExp> = new Map();

	private getCachedRegex(rule: Rule): RegExp {
		if (!rule._compiled || rule._dirty) {
			// Always escape the text and create a literal regex
			rule._compiled = new RegExp(this.escapeRegExp(rule.condition), "gi");
			rule._dirty = false;
		}
		return rule._compiled;
	}

	// Add method to clear cache when rules change
	private clearRegexCache() {
		this.regexCache.clear();
	}

	// Add class property to track current update
	private currentUpdatePromise: Promise<void> | null = null;

	public filterActive: boolean = false;
	private filterDecorationType: vscode.TextEditorDecorationType;
	private matchedLines = new Set<number>();

	// Add new decoration type property
	private selectedRuleDecorationType?: vscode.TextEditorDecorationType;

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

		this.filterDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: new vscode.ThemeColor("editor.background"),
			color: new vscode.ThemeColor("editor.background"),
			textDecoration: "none",
		});
	}

	/**
	 * Retrieves the currently selected rule.
	 * @returns The selected Rule or null if none is selected.
	 */
	public getSelectedRule(): Rule | null {
		return this.selectedRule;
	}

	/**
	 * Finds all occurrences of a rule in the document.
	 * @param rule The rule to search for.
	 * @param document The text document.
	 * @returns An array of ranges where the rule matches.
	 */
	async findOccurrences(
		rule: Rule,
		document: vscode.TextDocument
	): Promise<vscode.Range[]> {
		const occurrences: vscode.Range[] = [];
		const regex = this.getCachedRegex(rule);
		const text = document.getText();
		let match;

		// Reset match count
		rule.matchCount = 0;

		// Process in batches to avoid blocking the UI
		const batchSize = 1000;
		let position = 0;

		while ((match = regex.exec(text)) !== null) {
			// Prevent infinite loops from zero-length matches
			if (match.index === regex.lastIndex) {
				regex.lastIndex++;
			}

			const startPos = document.positionAt(match.index);
			const endPos = document.positionAt(match.index + match[0].length);
			occurrences.push(new vscode.Range(startPos, endPos));
			rule.matchCount++;

			// Yield to event loop every batchSize matches
			if (rule.matchCount % batchSize === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		return occurrences;
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
		const MAX_PROCESSING_TIME = 30000;
		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Window,
					title: "Applying rules...",
				},
				async (progress) => {
					await Promise.race([
						this.updateDecorations(editor, progress),
						new Promise((_, reject) =>
							setTimeout(
								() => reject("Processing timed out"),
								MAX_PROCESSING_TIME
							)
						),
					]);
				}
			);
		} catch (error) {
			this.outputChannel.appendLine(`Error applying rules: ${error}`);
			vscode.window.showErrorMessage(`Rule application failed: ${error}`);
		}
	}

	/**
	 * Updates the decorations (highlighting) in the editor.
	 * Processes the entire file and adds overview ruler marks.
	 * @param editor The text editor to update.
	 * @param progress Optional progress indicator.
	 */
	private async updateDecorations(
		editor: vscode.TextEditor,
		progress?: vscode.Progress<{ message?: string; increment?: number }>
	) {
		const startTime = Date.now();
		// Batch processing parameters
		const BATCH_SIZE = 500;
		const YIELD_INTERVAL = 50;

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
		let processedLines = 0;
		this.matchedLines.clear();

		while (processedLines < lineCount) {
			const batchEnd = Math.min(processedLines + BATCH_SIZE, lineCount);

			for (let lineNum = processedLines; lineNum < batchEnd; lineNum++) {
				const line = editor.document.lineAt(lineNum);
				const lineText = line.text;

				const matchingRules: Rule[] = [];
				const lineRulesSet = new Set<string>();

				for (const rule of rules) {
					let regex = this.getCachedRegex(rule);
					let hasMatch = false;
					let match;

					// Reset regex lastIndex for proper matching
					regex.lastIndex = 0;

					while ((match = regex.exec(lineText)) !== null) {
						// Prevent infinite loops from zero-length matches
						if (match.index === regex.lastIndex) {
							regex.lastIndex++;
						}

						hasMatch = true;

						// Remove the appliedRulesSet check and always increment count
						rule.matchCount++;
						matchingRules.push(rule);

						// Process each match individually
						const startPos = new vscode.Position(lineNum, match.index);
						const endPos = new vscode.Position(
							lineNum,
							match.index + match[0].length
						);
						const matchRange = new vscode.Range(startPos, endPos);

						// Add match decoration
						let matchDecorationType = this.matchDecorationTypes[rule.color];
						if (!matchDecorationType) {
							matchDecorationType =
								vscode.window.createTextEditorDecorationType({
									backgroundColor: this.applyOpacityToColor(rule.color, 0.3),
									overviewRulerColor: this.applyOpacityToColor(rule.color, 0.5),
									overviewRulerLane: vscode.OverviewRulerLane.Full,
								});
							this.matchDecorationTypes[rule.color] = matchDecorationType;
						}

						if (!matchDecorationOptionsMap[rule.color]) {
							matchDecorationOptionsMap[rule.color] = [];
						}
						matchDecorationOptionsMap[rule.color].push({ range: matchRange });

						if (hasMatch) {
							this.matchedLines.add(lineNum);
						}
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
								margin: `0 6px 0 0`,
							},
						},
					};
					indicatorDecorationOptions.push(indicatorOption);
					marginRight += 6;
				}
			}

			processedLines = batchEnd;

			// Update progress less frequently
			if (progress && processedLines % YIELD_INTERVAL === 0) {
				progress.report({
					message: `Processed ${processedLines} of ${lineCount} lines`,
					increment: (BATCH_SIZE / lineCount) * 100,
				});

				// Yield to event loop
				await new Promise((resolve) => setTimeout(resolve, 0));
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

		// Apply filter if active
		if (this.filterActive) {
			const allLines = Array.from({ length: lineCount }, (_, i) => i);
			const unmatchedLines = allLines.filter(
				(line) => !this.matchedLines.has(line)
			);
			const unmatchedRanges = unmatchedLines.map(
				(line) => editor.document.lineAt(line).range
			);
			editor.setDecorations(this.filterDecorationType, unmatchedRanges);
		} else {
			editor.setDecorations(this.filterDecorationType, []);
		}

		// Add selected rule highlights with text
		if (this.selectedRule) {
			// Clear previous decoration type
			if (this.selectedRuleDecorationType) {
				this.selectedRuleDecorationType.dispose();
			}

			// Create new decoration type that hides original text
			this.selectedRuleDecorationType =
				vscode.window.createTextEditorDecorationType({
					textDecoration: "none; font-size: 0;",
				});

			// Create decoration options with badge styling
			const selectedRule = this.selectedRule;
			const textColor = this.getContrastColor(selectedRule.color);
			const selectedRuleOptions: vscode.DecorationOptions[] =
				this.currentMatches.map((range) => {
					const isActive = this.isCursorInRange(editor, range);
					return {
						range,
						renderOptions: {
							before: {
								contentText: ` ${selectedRule.condition} `,
								color: textColor,
								backgroundColor: this.applyOpacityToColor(
									selectedRule.color,
									isActive ? 1 : 0.8
								),
								margin: "0 6px 0 0",
								padding: "2px 12px",
								borderRadius: "14px",
								fontWeight: "bold",
								fontSize: "14px",
								border: `2px solid ${
									isActive ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"
								}`,
								textDecoration: "none",
								letterSpacing: "0.5px",
							},
						},
					};
				});

			editor.setDecorations(
				this.selectedRuleDecorationType,
				selectedRuleOptions
			);
		}

		const duration = Date.now() - startTime;
		this.outputChannel.appendLine(
			`Processed ${lineCount} lines in ${duration}ms`
		);
	}

	private applyOpacityToColor(color: string, opacity: number): string {
		// Handle hex colors
		if (color.startsWith("#")) {
			const hex = color.replace("#", "");
			const r = parseInt(hex.substring(0, 2), 16);
			const g = parseInt(hex.substring(2, 4), 16);
			const b = parseInt(hex.substring(4, 6), 16);
			return `rgba(${r}, ${g}, ${b}, ${opacity})`;
		}

		// Handle rgba colors
		return color.replace(
			/rgba?\((\d+), (\d+), (\d+),? ?([\d.]+)?\)/,
			(_, r, g, b) => `rgba(${r}, ${g}, ${b}, ${opacity})`
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
		// Add cancellation check for existing updates
		if (!this.currentUpdatePromise) {
			this.currentUpdatePromise = this.updateDecorationsWithProgress(
				editor
			).finally(() => {
				this.currentUpdatePromise = null;
			});
		}
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
		// Reset compiled regexes after loading
		for (const fileUri in this.fileRules) {
			this.fileRules[fileUri] = this.fileRules[fileUri].map((rule) => ({
				...rule,
				_compiled: undefined,
				_dirty: true,
			}));
		}
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
			this.triggerUpdateDecorations(vscode.window.activeTextEditor!);
		} else {
			vscode.window.showInformationMessage("No occurrences to navigate.");
		}
	}

	public navigateToLastOccurrence() {
		if (this.currentMatches.length > 0) {
			this.currentIndex = this.currentMatches.length - 1;
			this.navigateToMatch(this.currentMatches[this.currentIndex]);
			this.triggerUpdateDecorations(vscode.window.activeTextEditor!);
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
			this.triggerUpdateDecorations(editor);
		} else {
			vscode.window.showInformationMessage("No occurrences to navigate.");
		}
	}

	public navigateToNextOccurrence() {
		if (this.currentMatches.length > 0) {
			this.currentIndex = (this.currentIndex + 1) % this.currentMatches.length;
			this.navigateToMatch(this.currentMatches[this.currentIndex]);
			this.triggerUpdateDecorations(vscode.window.activeTextEditor!);
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
			this.triggerUpdateDecorations(vscode.window.activeTextEditor!);
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
		this.currentMatches = await this.findOccurrences(rule, document);
		this.currentIndex = -1;

		// Add navigation to nearest occurrence
		if (this.currentMatches.length > 0) {
			this.navigateToNearestOccurrence();
		}

		// Add this line to trigger decorations update
		this.triggerUpdateDecorations(editor);

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
		if (this.selectedRuleDecorationType) {
			this.selectedRuleDecorationType.dispose();
		}
		// Add this line to clear decorations
		if (vscode.window.activeTextEditor) {
			this.triggerUpdateDecorations(vscode.window.activeTextEditor);
		}
		this.ruleDeselectedEmitter.fire();
	}

	public migrateRulesToAnnotations() {
		for (const fileUri in this.fileRules) {
			this.fileRules[fileUri] = this.fileRules[fileUri].map((rule) => ({
				...rule,
				isRegex: false, // Force all existing rules to be non-regex
			}));
		}
		this.saveRules();
	}

	public toggleFilter() {
		this.filterActive = !this.filterActive;
		vscode.commands.executeCommand(
			"setContext",
			"logViewer.filterActive",
			this.filterActive
		);
		if (vscode.window.activeTextEditor) {
			this.triggerUpdateDecorations(vscode.window.activeTextEditor);
		}
	}

	// Update the contrast calculation to use WCAG 2.1 standards
	private getContrastColor(hexColor: string): string {
		const cleanColor = hexColor.replace(/[^0-9a-f]/gi, "").slice(0, 6);
		const r = parseInt(cleanColor.slice(0, 2), 16);
		const g = parseInt(cleanColor.slice(2, 4), 16);
		const b = parseInt(cleanColor.slice(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? "#000000" : "#ffffff";
	}

	// Add this helper method to check cursor position
	private isCursorInRange(
		editor: vscode.TextEditor,
		range: vscode.Range
	): boolean {
		const cursorLine = editor.selection.active.line;
		return range.start.line <= cursorLine && range.end.line >= cursorLine;
	}
}
