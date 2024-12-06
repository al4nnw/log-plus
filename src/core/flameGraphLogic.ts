// core/flameGraphLogic.ts

import * as vscode from "vscode";
import { Webview } from "vscode";

export interface FlameEvent {
	line: number;
	timestamp: Date;
	blocks: string[];
	duration?: number;
}

// Known date patterns (just a few examples, now including a pattern with comma for milliseconds)
const knownDatePatterns = [
	{
		label: "ISO (e.g. 2021-05-20T13:45:30.123Z)",
		pattern: "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z?",
	},
	{
		label: "dd/mm/yyyy hh:mm:ss",
		pattern: "\\d{2}/\\d{2}/\\d{4}\\s+\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?",
	},
	{
		label: "yyyy-mm-dd hh:mm:ss",
		pattern: "\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?",
	},
	{
		label: "yyyy-mm-dd hh:mm:ss,ms",
		pattern: "\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2},\\d{3}",
	},
];

// Default block name extraction patterns
const defaultBlockPatterns = [
	"\\[([^\\]]+)\\]",
	"\\{([^}]+)\\}",
	"\\(([^)]+)\\)",
	'"([^"]+)"',
];

// Set of log levels to discard if found as blocks
const logLevelsToDiscard = new Set([
	"INFO",
	"WARN",
	"WARNING",
	"DEBUG",
	"ERROR",
]);

export async function pickDatePattern(
	storedDatePattern?: string
): Promise<string | undefined> {
	const options = knownDatePatterns.map((k) => k.label);
	options.push("Custom Pattern");

	const choice = await vscode.window.showQuickPick(options, {
		placeHolder: "Select a known date pattern or pick custom",
	});

	if (!choice) {
		return undefined;
	}

	if (choice === "Custom Pattern") {
		const custom = await vscode.window.showInputBox({
			prompt: "Enter a custom date regex pattern",
			value: storedDatePattern || "",
		});
		return custom || undefined;
	} else {
		const selected = knownDatePatterns.find((k) => k.label === choice);
		return selected?.pattern;
	}
}

export async function pickBlockPattern(
	storedBlockPattern?: string
): Promise<string | undefined> {
	const options = ["Default Patterns", "Custom Pattern"];

	const choice = await vscode.window.showQuickPick(options, {
		placeHolder: "Select block name extraction mode",
	});

	if (!choice) {
		return undefined;
	}

	if (choice === "Custom Pattern") {
		const custom = await vscode.window.showInputBox({
			prompt:
				"Enter a custom block name regex pattern (the first capturing group returns the block name)",
			value: storedBlockPattern || "",
		});
		return custom || undefined;
	} else {
		return "default";
	}
}

export function parseLinesForEvents(
	lines: string[],
	datePattern: string,
	blockPattern: string,
	startLine: number
): FlameEvent[] {
	const events: FlameEvent[] = [];
	const dateRegex = new RegExp(datePattern);

	// Map to keep track of the current block hierarchy
	const blockStack: string[] = [];

	let lastEvent: FlameEvent | null = null;

	for (let i = 0; i < lines.length; i++) {
		const lineText = lines[i];
		const dateMatch = dateRegex.exec(lineText);
		if (!dateMatch) {
			continue; // no date match in this line
		}

		const dateStr = dateMatch[0];
		const timestamp = parseDateFromString(dateStr);
		if (!timestamp) {
			continue; // failed to parse date
		}

		// Analyze the line to extract hierarchical blocks
		const blocks = extractBlocksFromLine(lineText, blockPattern);

		// Update the block stack based on the extracted blocks
		updateBlockStack(blockStack, blocks);

		const currentBlocks = [...blockStack];

		if (lastEvent && arrayEquals(currentBlocks, lastEvent.blocks)) {
			// Extend the duration of the last event
			continue; // Skip adding a new event
		}

		const evt: FlameEvent = {
			line: startLine + i,
			timestamp: timestamp,
			blocks: currentBlocks, // Copy the current hierarchy
		};
		events.push(evt);
		lastEvent = evt;
	}

	// Calculate durations between events
	for (let i = 0; i < events.length; i++) {
		const currentEvent = events[i];
		const nextEvent = events[i + 1];
		currentEvent.duration = nextEvent
			? nextEvent.timestamp.getTime() - currentEvent.timestamp.getTime()
			: 0; // Last event has duration 0
	}

	return events;
}

// Helper function to compare arrays
function arrayEquals(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

function extractBlocksFromLine(
	lineText: string,
	blockPattern: string
): string[] {
	const blocks: string[] = [];
	let blockRegexes: RegExp[] = [];

	if (blockPattern === "default") {
		blockRegexes = defaultBlockPatterns.map((p) => new RegExp(p, "g"));
	} else {
		blockRegexes = [new RegExp(blockPattern, "g")];
	}

	// Extract blocks and maintain order
	for (const br of blockRegexes) {
		br.lastIndex = 0;
		let match;
		while ((match = br.exec(lineText)) !== null) {
			const candidate = match[1].trim();
			if (!logLevelsToDiscard.has(candidate.toUpperCase())) {
				blocks.push(candidate);
			}
		}
	}

	return blocks;
}

function updateBlockStack(blockStack: string[], newBlocks: string[]): void {
	// Compare newBlocks with current blockStack to find common prefix
	let commonIndex = 0;
	while (
		commonIndex < blockStack.length &&
		commonIndex < newBlocks.length &&
		blockStack[commonIndex] === newBlocks[commonIndex]
	) {
		commonIndex++;
	}

	// Remove blocks that are no longer active
	blockStack.splice(commonIndex);

	// Add new blocks
	for (let i = commonIndex; i < newBlocks.length; i++) {
		blockStack.push(newBlocks[i]);
	}
}

function parseDateFromString(dateStr: string): Date | null {
	// Try Date constructor (works for ISO)
	const d = new Date(dateStr);
	if (!isNaN(d.getTime())) {
		return d;
	}

	// Try dd/mm/yyyy hh:mm:ss(.ms)
	let match = dateStr.match(
		/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(\.\d+)?/
	);
	if (match) {
		const [_, DD, MM, YYYY, hh, mm, ss] = match;
		return new Date(
			Number(YYYY),
			Number(MM) - 1,
			Number(DD),
			Number(hh),
			Number(mm),
			Number(ss)
		);
	}

	// Try yyyy-mm-dd hh:mm:ss(.ms)
	match = dateStr.match(
		/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(\.\d+)?/
	);
	if (match) {
		const [_, YYYY, MM, DD, hh, mm, ss] = match;
		return new Date(
			Number(YYYY),
			Number(MM) - 1,
			Number(DD),
			Number(hh),
			Number(mm),
			Number(ss)
		);
	}

	// Try yyyy-mm-dd hh:mm:ss,ms (with comma)
	match = dateStr.match(
		/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})/
	);
	if (match) {
		const [_, YYYY, MM, DD, hh, mm, ss, ms] = match;
		return new Date(
			Number(YYYY),
			Number(MM) - 1,
			Number(DD),
			Number(hh),
			Number(mm),
			Number(ss),
			Number(ms)
		);
	}

	// If all fails, return null
	return null;
}

export function createFlameGraphHTML(
	webview: Webview,
	events: FlameEvent[],
	rulesCounts: { rule: string; count: number }[]
): string {
	const times = events.map((e) => e.timestamp.getTime());
	const minTime = Math.min(...times);
	const maxTime = Math.max(...times);

	let range = maxTime - minTime;
	if (range === 0) {
		range = 1000; // avoid division by zero if all events same time
	}

	const divisions = 5;
	const increment = range / divisions;

	const width = 1000;
	const height = 600;
	const baseline = 50; // Adjust baseline to top

	function xForTime(t: number): number {
		return ((t - minTime) / range) * width;
	}

	const blockColors = ["#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#FFC300"];

	let svgEvents = "";
	const blockHeight = 20;
	const blockSpacing = 5;

	for (const evt of events) {
		const x = xForTime(evt.timestamp.getTime());
		const duration = evt.duration || 10; // Default duration if undefined
		const width = (duration / range) * 1000; // Scale width based on duration

		evt.blocks.forEach((block, bIndex) => {
			// Adjust y position based on block depth
			const y = baseline + bIndex * (blockHeight + blockSpacing);
			const color = blockColors[bIndex % blockColors.length];
			const tooltip = `Block: ${block}
Duration: ${evt.duration} ms
Line Start: ${evt.line}
Line End: ${evt.line}`;

			svgEvents += `<rect x="${x}" y="${y}" width="${width}" height="${blockHeight}" fill="${color}" data-line="${evt.line}" class="blockRect">
				<title>${tooltip}</title>
			</rect>`;

			// Remove text annotations
			// Previously, there was code here to add text labels to the blocks. It's removed now.
		});
	}

	// Update axis line and labels color to white
	let svgAxis = `<line x1="0" y1="${baseline + 10}" x2="${width}" y2="${
		baseline + 10
	}" stroke="white" />`;
	for (let i = 0; i <= divisions; i++) {
		const tx = (i / divisions) * width;
		const tVal = new Date(minTime + i * increment);
		svgAxis += `<line x1="${tx}" y1="${baseline + 5}" x2="${tx}" y2="${
			baseline + 15
		}" stroke="white"/>`;
		svgAxis += `<text x="${tx}" y="${
			baseline + 30
		}" font-size="12" text-anchor="middle" fill="white">${formatTime(
			tVal
		)}</text>`;
	}

	// Modify SVG container to be responsive
	const svgContainer = `
	<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" style="width: 100%; height: auto;">
		${svgAxis}
		${svgEvents}
	</svg>
	`;

	// Generate rules list HTML
	let rulesListHTML = "";
	if (rulesCounts && rulesCounts.length > 0) {
		rulesListHTML = "<h2>Rules and Counts</h2><ul>";
		for (const rc of rulesCounts) {
			rulesListHTML += `<li>${rc.rule}: ${rc.count}</li>`;
		}
		rulesListHTML += "</ul>";
	}

	// Adjust the style to prevent legend overlap
	const style = `
	<style>
	body { font-family: sans-serif; margin: 10px; background-color: transparent; }
	svg { border: 1px solid #ccc; background-color: var(--vscode-editor-background); }
	.blockRect:hover { stroke: black; stroke-width: 1; cursor: pointer; }
	text { font-family: sans-serif; }
	.legend { margin-top: 20px; } /* Add margin-top to prevent overlap */
	</style>
	`;

	const script = `
	<script>
	const vscode = acquireVsCodeApi();
	document.querySelectorAll('.blockRect').forEach(rect => {
		rect.addEventListener('click', () => {
			const line = rect.getAttribute('data-line');
			vscode.postMessage({ command: 'goToLine', line: parseInt(line) });
		});
	});
	</script>
	`;

	const html = `
	<!DOCTYPE html>
	<html>
	<head>
	${style}
	</head>
	<body>
	${rulesListHTML}
	<h1>Flame Graph</h1>
	<p>Click on a block to jump to that line in the original file.</p>
	${svgContainer}
	${script}
	</body>
	</html>
	`;

	return html;
}

// Function to get a contrasting text color based on background color
function getContrastColor(hexColor: string): string {
	// Convert hex color to RGB
	const r = parseInt(hexColor.substr(1, 2), 16);
	const g = parseInt(hexColor.substr(3, 2), 16);
	const b = parseInt(hexColor.substr(5, 2), 16);
	// Calculate luminance
	const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
	// Return black or white depending on luminance
	return luminance > 186 ? "#000000" : "#ffffff";
}

function formatTime(d: Date): string {
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}
