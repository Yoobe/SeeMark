import * as vscode from 'vscode';

let isEnabled = true; // Enable by default
const decorationTypes = new Map<string, vscode.TextEditorDecorationType>();

export function activate(context: vscode.ExtensionContext) {
    initializeDecorationTypes();

    const toggleCommand = vscode.commands.registerCommand('focusedMarkdown.toggle', () => {
        isEnabled = !isEnabled;
        vscode.window.showInformationMessage(`Focused Markdown ${isEnabled ? 'enabled' : 'disabled'}`);
        updateAllEditors();
    });

    const enableCommand = vscode.commands.registerCommand('focusedMarkdown.enable', () => {
        isEnabled = true;
        updateAllEditors();
    });

    const disableCommand = vscode.commands.registerCommand('focusedMarkdown.disable', () => {
        isEnabled = false;
        updateAllEditors();
    });

    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(() => {
        updateActiveEditor();
    });

    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
        if (isMarkdownFile(event.document)) {
            // Check for Enter key after ordered list item
            handleOrderedListAutoIncrement(event);
            updateEditorForDocument(event.document);
        }
    });

    const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (isMarkdownFile(event.textEditor.document)) {
            updateEditorForDocument(event.textEditor.document);
        }
    });

    context.subscriptions.push(
        toggleCommand,
        enableCommand,
        disableCommand,
        onDidChangeActiveTextEditor,
        onDidChangeTextDocument,
        onDidChangeTextEditorSelection
    );

    updateActiveEditor();
}

function initializeDecorationTypes() {
    decorationTypes.set('h1', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: new vscode.ThemeColor('editor.foreground'),
        before: {
            contentText: '',
            fontWeight: 'bold',
            color: new vscode.ThemeColor('editor.foreground')
        },
        textDecoration: 'none; font-size: 1.5em; line-height: 1.2'
    }));

    decorationTypes.set('h2', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: new vscode.ThemeColor('editor.foreground'),
        textDecoration: 'none; font-size: 1.3em; line-height: 1.2'
    }));

    decorationTypes.set('h3', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: new vscode.ThemeColor('editor.foreground'),
        textDecoration: 'none; font-size: 1.1em; line-height: 1.2'
    }));

    decorationTypes.set('bold', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold'
    }));

    decorationTypes.set('italic', vscode.window.createTextEditorDecorationType({
        fontStyle: 'italic'
    }));

    decorationTypes.set('code', vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('textCodeBlock.background'),
        border: '1px solid rgba(127,127,127,0.3)',
        borderRadius: '3px'
    }));

    decorationTypes.set('strikethrough', vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through'
    }));

    decorationTypes.set('bulletList', vscode.window.createTextEditorDecorationType({
        before: {
            contentText: '• ',
            color: new vscode.ThemeColor('editor.foreground'),
            fontWeight: 'bold',
            margin: '0 0 0 16px'
        },
        textDecoration: 'none; margin-left: 16px;'
    }));

    decorationTypes.set('orderedList', vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('editor.foreground'),
        fontWeight: '500',
        textDecoration: 'none; margin-left: 10px; padding-left: 2px'
    }));
}

function isMarkdownFile(document: vscode.TextDocument): boolean {
    return document.languageId === 'markdown';
}

function updateAllEditors() {
    vscode.window.visibleTextEditors.forEach(editor => {
        if (isMarkdownFile(editor.document)) {
            updateEditor(editor);
        }
    });
}

function updateActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (editor && isMarkdownFile(editor.document)) {
        updateEditor(editor);
    }
}

function updateEditorForDocument(document: vscode.TextDocument) {
    const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
    if (editor) {
        updateEditor(editor);
    }
}

function updateEditor(editor: vscode.TextEditor) {
    if (!isEnabled) {
        clearAllDecorations(editor);
        return;
    }

    const currentLine = editor.selection.active.line;
    const document = editor.document;
    const decorationsMap = new Map<string, vscode.DecorationOptions[]>();

    for (const [type] of decorationTypes) {
        decorationsMap.set(type, []);
    }

    for (let i = 0; i < document.lineCount; i++) {
        if (i === currentLine) continue;

        const line = document.lineAt(i);
        const text = line.text;

        parseLineForDecorations(text, i, decorationsMap);
    }

    for (const [type, decorationType] of decorationTypes) {
        const decorations = decorationsMap.get(type) || [];
        editor.setDecorations(decorationType, decorations);
    }
}

function parseLineForDecorations(text: string, lineNumber: number, decorationsMap: Map<string, vscode.DecorationOptions[]>) {
    if (text.startsWith('# ')) {
        addDecoration(decorationsMap, 'h1', lineNumber, 0, text.length);
        return;
    } else if (text.startsWith('## ')) {
        addDecoration(decorationsMap, 'h2', lineNumber, 0, text.length);
        return;
    } else if (text.startsWith('### ')) {
        addDecoration(decorationsMap, 'h3', lineNumber, 0, text.length);
        return;
    }

    // Handle bullet lists (- item)
    if (text.match(/^(\s*)- /)) {
        const match = text.match(/^(\s*)- (.*)$/);
        if (match) {
            const indent = match[1];
            // Hide the "- " and replace with bullet
            addDecoration(decorationsMap, 'bulletList', lineNumber, indent.length, indent.length + 2);
        }
        return;
    }

    // Handle ordered lists (1. item, 2. item, etc.)
    if (text.match(/^(\s*)\d+\.\s/)) {
        addDecoration(decorationsMap, 'orderedList', lineNumber, 0, text.length);
        return;
    }

    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;
    while ((match = boldRegex.exec(text)) !== null) {
        addDecoration(decorationsMap, 'bold', lineNumber, match.index, match.index + match[0].length);
    }

    const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
    while ((match = italicRegex.exec(text)) !== null) {
        addDecoration(decorationsMap, 'italic', lineNumber, match.index, match.index + match[0].length);
    }

    const codeRegex = /`([^`]+)`/g;
    while ((match = codeRegex.exec(text)) !== null) {
        addDecoration(decorationsMap, 'code', lineNumber, match.index, match.index + match[0].length);
    }

    const strikethroughRegex = /~~(.*?)~~/g;
    while ((match = strikethroughRegex.exec(text)) !== null) {
        addDecoration(decorationsMap, 'strikethrough', lineNumber, match.index, match.index + match[0].length);
    }
}

function addDecoration(decorationsMap: Map<string, vscode.DecorationOptions[]>, type: string, line: number, start: number, end: number) {
    const decorations = decorationsMap.get(type);
    if (decorations) {
        decorations.push({
            range: new vscode.Range(line, start, line, end)
        });
    }
}

function clearAllDecorations(editor: vscode.TextEditor) {
    for (const [, decorationType] of decorationTypes) {
        editor.setDecorations(decorationType, []);
    }
}

function handleOrderedListAutoIncrement(event: vscode.TextDocumentChangeEvent) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== event.document) return;

    // Check if this was a newline insertion
    for (const change of event.contentChanges) {
        if (change.text === '\n' || change.text === '\r\n') {
            const position = change.range.start;
            const currentLine = editor.document.lineAt(position.line);
            const currentText = currentLine.text;

            // Check if current line is an ordered list item
            const orderedListMatch = currentText.match(/^(\s*)(\d+)\.\s/);
            if (orderedListMatch) {
                const indent = orderedListMatch[1];
                const currentNumber = parseInt(orderedListMatch[2]);
                const nextNumber = currentNumber + 1;
                const nextListItem = `${indent}${nextNumber}. `;

                // Insert the next number on the new line
                const nextLinePosition = new vscode.Position(position.line + 1, 0);
                const edit = new vscode.WorkspaceEdit();
                edit.insert(event.document.uri, nextLinePosition, nextListItem);
                vscode.workspace.applyEdit(edit);
            }
        }
    }
}

export function deactivate() {
    for (const [, decorationType] of decorationTypes) {
        decorationType.dispose();
    }
    decorationTypes.clear();
}


