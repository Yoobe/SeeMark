import * as vscode from 'vscode';
import { registerSpacer, SpacerCodeLensProvider } from './spacerCodeLens';

const HR_RULE_RE = /^\s*---\s*$/;

let isEnabled = true;
const decorationTypes = new Map<string, vscode.TextEditorDecorationType>();
let spacer: SpacerCodeLensProvider | undefined;

type SeeMarkConfig = {
    headerColor: string;
    h1Scale: number;
    h2Scale: number;
    h3Scale: number;
    h4Scale: number;
    inlineCodeBorderRadius: string;
    inlineCodeBorderColor: string;
    inlineCodeUseThemeBackground: boolean;
    inlineCodeBackground: string;
    bulletMarker: string;
    orderedListFontWeight: string;
    horizontalRuleWidth: string;
    hideMarkdownSyntax: boolean;
    dimHiddenSyntax: boolean;
};

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
            handleListAutoIncrement(event);
            updateEditorForDocument(event.document);
        }
    });

    const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (isMarkdownFile(event.textEditor.document)) {
            updateEditorForDocument(event.textEditor.document);
        }
    });

    const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('seeMark')) {
            initializeDecorationTypes();
            updateAllEditors();
            spacer?.refresh();
        }
    });

    context.subscriptions.push(
        toggleCommand,
        enableCommand,
        disableCommand,
        onDidChangeActiveTextEditor,
        onDidChangeTextDocument,
        onDidChangeTextEditorSelection,
        onDidChangeConfiguration
    );

    updateActiveEditor();
}

function getConfig(): SeeMarkConfig {
    const cfg = vscode.workspace.getConfiguration('seeMark');
    return {
        headerColor: cfg.get<string>('headerColor', '#a0a8b3'),
        h1Scale: cfg.get<number>('h1Scale', 1.7),
        h2Scale: cfg.get<number>('h2Scale', 1.4),
        h3Scale: cfg.get<number>('h3Scale', 1.18),
        h4Scale: cfg.get<number>('h4Scale', 1.05),
        inlineCodeBorderRadius: cfg.get<string>('inlineCodeBorderRadius', '5px'),
        inlineCodeBorderColor: cfg.get<string>('inlineCodeBorderColor', 'rgba(127,127,127,0.22)'),
        inlineCodeUseThemeBackground: cfg.get<boolean>('inlineCodeUseThemeBackground', true),
        inlineCodeBackground: cfg.get<string>('inlineCodeBackground', 'rgba(127,127,127,0.12)'),
        bulletMarker: cfg.get<string>('bulletMarker', '•'),
        orderedListFontWeight: cfg.get<string>('orderedListFontWeight', '500'),
        horizontalRuleWidth: cfg.get<string>('horizontalRuleWidth', '60ch'),
        hideMarkdownSyntax: cfg.get<boolean>('hideMarkdownSyntax', true),
        dimHiddenSyntax: cfg.get<boolean>('dimHiddenSyntax', true)
    };
}

function disposeDecorationTypes() {
    for (const [, decorationType] of decorationTypes) {
        decorationType.dispose();
    }
    decorationTypes.clear();
}

function initializeDecorationTypes() {
    disposeDecorationTypes();

    const cfg = getConfig();

    decorationTypes.set('h1', vscode.window.createTextEditorDecorationType({
        fontWeight: '700',
        color: cfg.headerColor,
        before: {
            contentText: '',
            fontWeight: '700',
            color: cfg.headerColor
        },
        textDecoration: `none; font-size: ${cfg.h1Scale}em; line-height: 1.25`
    }));

    decorationTypes.set('h2', vscode.window.createTextEditorDecorationType({
        fontWeight: '650',
        color: cfg.headerColor,
        textDecoration: `none; font-size: ${cfg.h2Scale}em; line-height: 1.2`
    }));

    decorationTypes.set('h3', vscode.window.createTextEditorDecorationType({
        fontWeight: '650',
        color: new vscode.ThemeColor('editor.foreground'),
        textDecoration: `none; font-size: ${cfg.h3Scale}em; line-height: 1.2`
    }));

    decorationTypes.set('h4', vscode.window.createTextEditorDecorationType({
        fontWeight: '600',
        color: new vscode.ThemeColor('editor.foreground'),
        textDecoration: `none; font-size: ${cfg.h4Scale}em; line-height: 1.15`
    }));

    decorationTypes.set('h1Symbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; margin-left: -2ch; position: absolute'
    }));

    decorationTypes.set('h2Symbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; margin-left: -3ch; position: absolute'
    }));

    decorationTypes.set('h3Symbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; margin-left: -4ch; position: absolute'
    }));

    decorationTypes.set('h4Symbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; margin-left: -5ch; position: absolute'
    }));

    decorationTypes.set('boldSymbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('boldContent', vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        color: new vscode.ThemeColor('editor.foreground')
    }));

    decorationTypes.set('italicSymbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('italicContent', vscode.window.createTextEditorDecorationType({
        fontStyle: 'italic'
    }));

    decorationTypes.set('codeSymbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('codeContent', vscode.window.createTextEditorDecorationType({
        backgroundColor: cfg.inlineCodeUseThemeBackground
            ? new vscode.ThemeColor('textCodeBlock.background')
            : cfg.inlineCodeBackground,
        border: `1px solid ${cfg.inlineCodeBorderColor}`,
        borderRadius: cfg.inlineCodeBorderRadius
    }));

    decorationTypes.set('strikethroughSymbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('strikethroughContent', vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through'
    }));

    decorationTypes.set('bulletSymbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? (cfg.dimHiddenSyntax ? '0.2' : '0') : '1',
        color: 'rgba(127,127,127,0.2)'
    }));

    decorationTypes.set('linkSymbols', vscode.window.createTextEditorDecorationType({
        opacity: cfg.hideMarkdownSyntax ? '0' : '1',
        textDecoration: 'none; font-size: 0; width: 0; position: absolute; overflow: hidden'
    }));

    decorationTypes.set('linkContent', vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('textLink.foreground'),
        textDecoration: 'underline'
    }));

    decorationTypes.set('bulletList', vscode.window.createTextEditorDecorationType({
        before: {
            contentText: cfg.bulletMarker,
            color: new vscode.ThemeColor('editor.foreground'),
            fontWeight: 'bold',
            margin: '0 0 0 16px'
        },
        textDecoration: 'none; margin-left: 8px;'
    }));

    decorationTypes.set('orderedList', vscode.window.createTextEditorDecorationType({
        color: new vscode.ThemeColor('editor.foreground'),
        fontWeight: cfg.orderedListFontWeight,
        textDecoration: 'none; padding-left: 0px'
    }));

    decorationTypes.set('orderedListIndent', vscode.window.createTextEditorDecorationType({
        textDecoration: 'none; margin-left: 16px'
    }));

    decorationTypes.set('hrRule', vscode.window.createTextEditorDecorationType({
        color: 'transparent',
        textDecoration:
            `none; display: inline-block; width: ${cfg.horizontalRuleWidth}; ` +
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
    vscode.window.visibleTextEditors.forEach(editor => {
        if (editor.document === document) {
            updateEditor(editor);
        }
    });
}

function clearAllDecorations(editor: vscode.TextEditor) {
    for (const [, decorationType] of decorationTypes) {
        editor.setDecorations(decorationType, []);
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

        if (text.trim() === '') {
            continue;
        }

        if (!isFocused) {
            processHeaderLine(line, text, decorationsMap);
            processInlineMarkdown(line, text, decorationsMap);
            processBulletList(line, text, decorationsMap);
            processOrderedList(line, text, decorationsMap);
            processHorizontalRule(line, text, decorationsMap);
        }
    }

    for (const [type, decorations] of decorationsMap) {
        const decorationType = decorationTypes.get(type);
        if (decorationType) {
            editor.setDecorations(decorationType, decorations);
        }
    }
}

function processHeaderLine(
    line: vscode.TextLine,
    text: string,
    decorationsMap: Map<string, vscode.DecorationOptions[]>
) {
    const headerMatch = text.match(/^(#{1,4})\s+(.+)$/);
    if (!headerMatch) {
        return;
    }

    const level = headerMatch[1].length;
    const headerText = headerMatch[2];
    const symbolLength = level + 1;
    const symbolRange = new vscode.Range(
        line.lineNumber,
        0,
        line.lineNumber,
        symbolLength
    );
    const contentRange = new vscode.Range(
        line.lineNumber,
        symbolLength,
        line.lineNumber,
        text.length
    );

    decorationsMap.get(`h${level}Symbols`)?.push({ range: symbolRange });
    decorationsMap.get(`h${level}`)?.push({
        range: contentRange,
        hoverMessage: `Header ${level}: ${headerText}`
    });
}

function processInlineMarkdown(
    line: vscode.TextLine,
    text: string,
    decorationsMap: Map<string, vscode.DecorationOptions[]>
) {
    const patterns = [
        {
            regex: /\*\*([^*]+)\*\*/g,
            symbolType: 'boldSymbols',
            contentType: 'boldContent'
        },
        {
            regex: /\*([^*]+)\*/g,
            symbolType: 'italicSymbols',
            contentType: 'italicContent'
        },
        {
            regex: /`([^`]+)`/g,
            symbolType: 'codeSymbols',
            contentType: 'codeContent'
        },
        {
            regex: /~~([^~]+)~~/g,
            symbolType: 'strikethroughSymbols',
            contentType: 'strikethroughContent'
        },
        {
            regex: /\[([^\]]+)\]\([^)]+\)/g,
            symbolType: 'linkSymbols',
            contentType: 'linkContent',
            linkTextGroup: 1
        }
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.regex.exec(text)) 
