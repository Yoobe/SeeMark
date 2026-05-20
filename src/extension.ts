import * as vscode from 'vscode';
import { registerSpacer, SpacerCodeLensProvider } from './spacerCodeLens';

// A line whose sole content is exactly "---" (optional surrounding whitespace)
// is a thematic break. Pipe-delimited / colon table separators contain | or :
// so they never match. Per decision D1 the extension is line-based and not
// block-aware: YAML front-matter and bare single-column separators also match
// and render as rules by design (focus-reveal is the escape hatch). `\s` also
// matches `\r`, but document.lineAt().text is EOL-stripped by VSCode so a CRLF
// file is safe.
// NOTE: an identical copy lives in spacerCodeLens.ts (deliberately not shared
// to avoid a cross-file import for one regex); any change to detection must
// update BOTH files in lockstep.
const HR_RULE_RE = /^\s*---\s*$/;

let isEnabled = true; // Enable by default
const decorationTypes = new Map<string, vscode.TextEditorDecorationType>();
let spacer: SpacerCodeLensProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
    initializeDecorationTypes();
    spacer = registerSpacer(context, () => isEnabled);

    const toggleCommand = vscode.commands.registerCommand('SeeMark.toggle', () => {
        isEnabled = !isEnabled;
        vscode.window.showInformationMessage(`SeeMark ${isEnabled ? 'enabled' : 'disabled'}`);
        updateAllEditors();
        spacer?.refresh();
    });

    const enableCommand = vscode.commands.registerCommand('SeeMark.enable', () => {
        isEnabled = true;
        updateAllEditors();
        spacer?.refresh();
    });

    const disableCommand = vscode.commands.registerCommand('SeeMark.disable', () => {
        isEnabled = false;
        updateAllEditors();
        spacer?.refresh();
    });

    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(() => {
        updateActiveEditor();
    });

    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
        if (isMarkdownFile(event.document)) {
            // Check for Enter key after list items
            handleListAutoIncrement(event);
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

    const headerColor = '#ffa280';

    decorationTypes.set('h1', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: headerColor,
        before: {
            contentText: '',
            fontWeight: 'bold',
            color: headerColor
        },
        textDecoration: 'none; font-size: 1.75em; line-height: 1.2'
    }));

    decorationTypes.set('h2', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: headerColor,
        textDecoration: 'none; font-size: 1.5em; line-height: 1.2'
    }));

    decorationTypes.set('h3', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: headerColor,
        textDecoration: 'none; font-size: 1.25em; line-height: 1.2'
    }));

    decorationTypes.set('h4', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: headerColor,
        textDecoration: 'none; font-size: 1.1em; line-height: 1.2'
    }));

    // Header symbol hiding
    decorationTypes.set('h1Symbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; margin-left: -2ch; position: absolute'
    }));

    decorationTypes.set('h2Symbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; margin-left: -3ch; position: absolute'
    }));

    decorationTypes.set('h3Symbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; margin-left: -4ch; position: absolute'
    }));

    decorationTypes.set('h4Symbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; margin-left: -5ch; position: absolute'
    }));

    // Hide markdown symbols while styling content
    decorationTypes.set('boldSymbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('boldContent', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: new vscode.ThemeColor('editor.foreground')
    }));

    decorationTypes.set('italicSymbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('italicContent', vscode.window.createTextEditorDecorationType({
        fontStyle: 'italic'
    }));

    decorationTypes.set('codeSymbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('codeContent', vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('textCodeBlock.background'),
        border: '1px solid rgba(127,127,127,0.3)',
        borderRadius: '3px'
    }));

    decorationTypes.set('strikethroughSymbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('strikethroughContent', vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through'
    }));

    decorationTypes.set('bulletSymbols', vscode.window.createTextEditorDecorationType({
        opacity: '0.2',
        color: 'rgba(127,127,127,0.2)'
    }));

    decorationTypes.set('linkSymbols', vscode.window.createTextEditorDecorationType({
        opacity: '0',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('linkContent', vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('textLink.foreground'),
        textDecoration: 'underline'
    }));

    decorationTypes.set('bulletList', vscode.window.createTextEditorDecorationType({
        before: {
            contentText: '•',
            color: new vscode.ThemeColor('editor.foreground'),
            fontWeight: 'bold',
            margin: '0 0 0 16px'
        },
        textDecoration: 'none; margin-left: 8px;'
    }));

    // Original look, split exactly like the (bug-free) bullet path: whole-line
    // color/weight is safe (inherited text props, not box-model), but the
    // 16px indent must NOT span the whole line — VS Code re-injects a
    // whole-line margin at the word-wrap/render-chunk boundary (~char 50).
    decorationTypes.set('orderedList', vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('editor.foreground'),
        fontWeight: '500',
        textDecoration: 'none; padding-left: 0px'
    }));

    // Indent carried only on the short marker range — mirrors how bulletList
    // applies its `margin-left` to the 2-char "- " marker (never the whole
    // line), which is why bullets have no ~char-50 artifact.
    decorationTypes.set('orderedListIndent', vscode.window.createTextEditorDecorationType({
        textDecoration: 'none; margin-left: 16px'
    }));

    // Horizontal rule for a standalone "---" line. A single decoration over the
    // line's text: the dash glyphs are made transparent (the box is kept, so
    // there is something to draw the border on — a separate zero-box hide
    // decoration would collapse the box the rule needs) and a stretched
    // bottom border is drawn via the project's established raw-injection hack
    // (horizontal/visual CSS, which the decoration layout honors). Width is a
    // fixed ~60ch divider; the exact width/color is ratified at WU3.
    decorationTypes.set('hrRule', vscode.window.createTextEditorDecorationType({
        color: 'transparent',
        textDecoration: 'none; display: inline-block; width: 60ch; ' +
            'border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.4));'
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
        const line = document.lineAt(i);
        const text = line.text;
        const isFocused = i === currentLine;

        parseLineForDecorations(text, i, decorationsMap, isFocused);
    }

    for (const [type, decorationType] of decorationTypes) {
        const decorations = decorationsMap.get(type) || [];
        editor.setDecorations(decorationType, decorations);
    }
}

function parseLineForDecorations(text: string, lineNumber: number, decorationsMap: Map<string, vscode.DecorationOptions[]>, isFocused: boolean = false) {
    if (text.startsWith('# ')) {
        // Hide the "# " when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'h1Symbols', lineNumber, 0, 2);
        }
        // Style the entire line
        addDecoration(decorationsMap, 'h1', lineNumber, 0, text.length);
        return;
    } else if (text.startsWith('## ')) {
        // Hide the "## " when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'h2Symbols', lineNumber, 0, 3);
        }
        // Style the entire line
        addDecoration(decorationsMap, 'h2', lineNumber, 0, text.length);
        return;
    } else if (text.startsWith('### ')) {
        // Hide the "### " when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'h3Symbols', lineNumber, 0, 4);
        }
        // Style the entire line
        addDecoration(decorationsMap, 'h3', lineNumber, 0, text.length);
        return;
    } else if (text.startsWith('#### ')) {
        // Hide the "#### " when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'h4Symbols', lineNumber, 0, 5);
        }
        // Style the entire line
        addDecoration(decorationsMap, 'h4', lineNumber, 0, text.length);
        return;
    }

    // Horizontal rule: a line that is exactly "---" (optional surrounding
    // whitespace). Checked here, with the heading branches and before any
    // bullet/inline pass, and returns early so no other decoration touches a
    // rule line. When the line is focused, nothing is added so the raw "---"
    // is revealed (mirrors how headings reveal "# ").
    if (HR_RULE_RE.test(text)) {
        if (!isFocused) {
            addDecoration(decorationsMap, 'hrRule', lineNumber, 0, text.length);
        }
        return;
    }

    // Handle bullet lists (- item)
    const bulletMatch = text.match(/^(\s*)- /);
    if (bulletMatch) {
        const indent = bulletMatch[1];
        const indentLevel = Math.floor(indent.length / 2); // 2 spaces = 1 level
        const leftMargin = 16 + (indentLevel * 16); // Base margin + nested levels

        // Create or get decoration type for this indent level
        const bulletKey = `bulletList-${indentLevel}`;
        if (!decorationTypes.has(bulletKey)) {
            decorationTypes.set(bulletKey, vscode.window.createTextEditorDecorationType({
                before: {
                    contentText: '•',
                    color: new vscode.ThemeColor('editor.foreground'),
                    fontWeight: 'bold',
                    margin: `0 0 0 ${leftMargin}px`
                },
                textDecoration: 'none; margin-left: 8px;'
            }));
        }

        // Only hide symbols when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'bulletSymbols', lineNumber, indent.length, indent.length + 2);
        }
        addDecorationWithType(decorationsMap, bulletKey, lineNumber, indent.length, indent.length + 2);
        // Don't return - continue processing inline formatting
    }

    // Handle ordered lists (1. item, 2. item, etc.)
    const orderedMatch = text.match(/^(\s*)(\d+\.\s)/);
    if (orderedMatch) {
        const indent = orderedMatch[1];
        const markerStart = indent.length;
        const markerEnd = markerStart + orderedMatch[2].length;
        const indentLevel = Math.floor(indent.length / 2);
        const leftMargin = 16 + (indentLevel * 16);

        // Whole-line color/weight (original look, safe).
        addDecoration(decorationsMap, 'orderedList', lineNumber, 0, text.length);

        // Per-level indent applied ONLY to the marker range — mirrors the
        // bullet path so VS Code doesn't re-inject the margin at the
        // ~char-50 wrap point.
        const indentKey = `orderedListIndent-${indentLevel}`;
        if (!decorationTypes.has(indentKey)) {
            decorationTypes.set(indentKey, vscode.window.createTextEditorDecorationType({
                textDecoration: `none; margin-left: ${leftMargin}px`
            }));
        }
        addDecorationWithType(decorationsMap, indentKey, lineNumber, markerStart, markerEnd);
        // Don't return - continue processing inline formatting
    }

    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;
    while ((match = boldRegex.exec(text)) !== null) {
        // Only hide symbols when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'boldSymbols', lineNumber, match.index, match.index + 2);
            addDecoration(decorationsMap, 'boldSymbols', lineNumber, match.index + match[0].length - 2, match.index + match[0].length);
        }
        // Always style the content
        addDecoration(decorationsMap, 'boldContent', lineNumber, match.index + 2, match.index + 2 + match[1].length);
    }

    const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
    while ((match = italicRegex.exec(text)) !== null) {
        // Only hide symbols when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'italicSymbols', lineNumber, match.index, match.index + 1);
            addDecoration(decorationsMap, 'italicSymbols', lineNumber, match.index + match[0].length - 1, match.index + match[0].length);
        }
        // Always style the content
        addDecoration(decorationsMap, 'italicContent', lineNumber, match.index + 1, match.index + 1 + match[1].length);
    }

    const codeRegex = /`([^`]+)`/g;
    while ((match = codeRegex.exec(text)) !== null) {
        // Only hide symbols when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'codeSymbols', lineNumber, match.index, match.index + 1);
            addDecoration(decorationsMap, 'codeSymbols', lineNumber, match.index + match[0].length - 1, match.index + match[0].length);
        }
        // Always style the content
        addDecoration(decorationsMap, 'codeContent', lineNumber, match.index + 1, match.index + 1 + match[1].length);
    }

    const strikethroughRegex = /~~(.*?)~~/g;
    while ((match = strikethroughRegex.exec(text)) !== null) {
        // Only hide symbols when not focused
        if (!isFocused) {
            addDecoration(decorationsMap, 'strikethroughSymbols', lineNumber, match.index, match.index + 2);
            addDecoration(decorationsMap, 'strikethroughSymbols', lineNumber, match.index + match[0].length - 2, match.index + match[0].length);
        }
        // Always style the content
        addDecoration(decorationsMap, 'strikethroughContent', lineNumber, match.index + 2, match.index + 2 + match[1].length);
    }

    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = linkRegex.exec(text)) !== null) {
        const linkText = match[1];
        const linkUrl = match[2];
        
        // Only hide symbols and URL when not focused
        if (!isFocused) {
            // Hide the [ ] symbols
            addDecoration(decorationsMap, 'linkSymbols', lineNumber, match.index, match.index + 1); // [
            addDecoration(decorationsMap, 'linkSymbols', lineNumber, match.index + 1 + linkText.length, match.index + 1 + linkText.length + 1); // ]
            // Hide the entire URL part including ( )
            addDecoration(decorationsMap, 'linkSymbols', lineNumber, match.index + 1 + linkText.length + 1, match.index + match[0].length);
        }
        // Always style the link text
        addDecoration(decorationsMap, 'linkContent', lineNumber, match.index + 1, match.index + 1 + linkText.length);
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

function addDecorationWithType(decorationsMap: Map<string, vscode.DecorationOptions[]>, type: string, line: number, start: number, end: number) {
    if (!decorationsMap.has(type)) {
        decorationsMap.set(type, []);
    }
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

function handleListAutoIncrement(event: vscode.TextDocumentChangeEvent) {
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
                return;
            }

            // Check if current line is a bullet list item
            const bulletListMatch = currentText.match(/^(\s*)- \s*/);
            if (bulletListMatch) {
                const indent = bulletListMatch[1];
                const nextListItem = `${indent}- `;

                // Insert the next bullet on the new line
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


