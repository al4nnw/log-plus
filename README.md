# Log Viewer Extension for VS Code

A powerful extension for analyzing log files with customizable search rules and navigation.

## Features

- Create search rules with colored highlights
- Quick navigation between matches (first/previous/next/last)
- Rule management with color customization
- Import/export rules as JSON
- Filter mode to show only matching lines
- Tree view for rules, navigation, and sharing
- Status bar showing selected rule

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Log Viewer"
4. Click Install

## Usage

### Basic Workflow

1. Open a log file
2. Select text and:
   - Right-click → "Add/Remove Search Rule"
   - Or use the "+" button in the Rules panel
3. Use the Navigation panel to jump between matches
4. Toggle filtering with `Ctrl+Shift+P` → "Toggle Filter"

### Tree View Panels

- **Rules Panel**: Shows current file's rules and match counts
- **Navigation**: Jump between matches with arrow buttons
- **Share**: Import/export rules configuration

### Key Commands

- `Add Selected Text as Rule`: Right-click selected text
- `Toggle Filter`: Show only lines with matches
- `Clear All Rules`: Remove all rules for current file
- `Edit Search`: Modify existing rule's search term
- `Change Color`: Update highlight color for a rule

## Customization

Choose from 10 predefined colors for highlights. Colors are automatically assigned but can be manually changed through rule context menus.

## Contributing

Contributions welcome! Please open issues/pull requests on our [GitHub repository](https://github.com/your-repo-here).

## License

[MIT](LICENSE)
