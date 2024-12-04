# Log Plus

Log Plus is a Visual Studio Code extension designed to simplify and enhance the process of navigating log files. Spending countless hours searching through logs, I often found myself repeatedly looking for the same patterns in different files. This inspired me to create **Log Plus**—a tool to make working with log files more efficient and less tedious.

## Features

Log Plus comes packed with features to streamline your workflow:

- **Highlight log patterns with custom colors**  
  Quickly identify key log entries by applying custom highlight rules.

- **Manage highlight rules**  
  Easily add, edit, or delete highlight rules through an intuitive interface.

- **Export and import highlight rules**  
  Save your highlight configurations for reuse or share them with your team.

- **Convert files to a "-plus" version**  
  Safeguard your original log files by creating editable copies with a "-plus" suffix.

- **Revert changes made to "-plus" files**  
  Quickly undo modifications to "-plus" files to restore their original state.

## Installation

You can install this extension from the Visual Studio Code Marketplace.

1. Open Visual Studio Code.
2. Go to the Extensions view by clicking the Extensions icon in the Activity Bar on the side of the window or by pressing `Ctrl+Shift+X`.
3. Search for "Log Plus".
4. Click "Install" to add the extension to your editor.

## Usage

1. Open a log file in Visual Studio Code.
2. Use the command palette (`Ctrl+Shift+P`) and search for "Manage Highlight Rules" to manage your highlight rules.
3. Use the keybinding `Ctrl+Alt+H` to quickly open the highlight rules manager.
4. Follow the prompts to add, edit, or delete highlight rules.
5. Use the commands "Export Rules" and "Import Rules" to save and load your highlight rules.
6. Use the command "Convert to Plus" to create a "-plus" version of the current file.
7. Use the command "Revert Changes" to revert changes made to a "-plus" file.

## Contributing

Contributions are welcome! Here's how you can get involved:

1. Fork the repository.
2. Clone your fork: `git clone https://github.com/your-username/log-plus.git`
3. Navigate to the project directory: `cd log-plus`
4. Install dependencies: `npm install`
5. Make your changes.
6. Test your changes.
7. Commit and push your changes: `git commit -m "Description of your changes" && git push`
8. Create a pull request.

Please ensure you follow the code style and include tests for your changes.

## License

This project is licensed under the MIT License.
