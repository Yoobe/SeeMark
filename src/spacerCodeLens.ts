import * as vscode from 'vscode';

/**
 * RESEARCH PROTOTYPE — vertical spacing in the editor.
 *
 * Editor TextEditorDecorations cannot add vertical space: Monaco lays lines out
 * at a fixed, uniform line height and the decoration CSS allowlist never emits
 * line-height / block-height (see research-vscode-vspacing.md). The only stable,
 * Marketplace-shippable primitive that produces a *real* extra layout row — one
 * that genuinely pushes subsequent lines down — is a CodeLens.
 *
 * This provider emits a near-invisible CodeLens (a single-space title, no-op
 * command) immediately above each markdown heading, and above + below each
 * standalone "---" thematic break (a real layout row is the only stable way to
 * put vertical breathing room around the rule that the decoration in
 * extension.ts draws). It is deliberately isolated in its own file so it can be
 * kept, tuned, or reverted without touching the decoration pipeline.
 */

const NOOP_COMMAND = 'SeeMark._spacerNoop';

// Standalone "---" thematic-break detection. Intentionally a SEPARATE copy of
// the literal in extension.ts (no cross-file import for one regex); any change
// to detection must update BOTH files in lockstep.
const HR_RULE_RE = /^\s*---\s*$/;

export class SpacerCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChange.event;

    constructor(private readonly isEnabled: () => boolean) {}

    /** Call when the enabled state flips so VSCode re-queries the lenses. */
    refresh(): void {
        this._onDidChange.fire();
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!this.isEnabled() || document.languageId !== 'markdown') {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];
        // An en-space (' ') reserves the full lens row but renders no
        // visible glyph. An empty string is not guaranteed to render the
        // row across themes.
        const pushSpacer = (line: number) => {
            lenses.push(
                new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
                    title: ' ',
                    command: NOOP_COMMAND,
                })
            );
        };

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            // Breathing room ABOVE headings only. Skip line 0: there is no room
            // above the first line and a leading lens reads as clutter.
            if (i > 0 && /^#{1,6}\s/.test(text)) {
                pushSpacer(i);
            }

            // Breathing room AROUND a standalone "---" rule: a lens on the
            // rule line itself = gap ABOVE the rule; a lens on the line
            // after it = gap BELOW the rule. (A lens renders as a real row
            // above its anchor line.) Skip line 0 for the same reason as
            // headings. If the line after "---" is itself a heading, VSCode
            // coalesces both spacers onto one shared row -- one clean gap,
            // which is intended.
            if (HR_RULE_RE.test(text)) {
                if (i > 0) {
                    pushSpacer(i);
                }
                if (i + 1 < document.lineCount) {
                    pushSpacer(i + 1);
                }
            }
        }
        return lenses;
    }
}

export function registerSpacer(
    context: vscode.ExtensionContext,
    isEnabled: () => boolean
): SpacerCodeLensProvider {
    const provider = new SpacerCodeLensProvider(isEnabled);
    context.subscriptions.push(
        vscode.commands.registerCommand(NOOP_COMMAND, () => {
            /* intentional no-op: this lens exists only to reserve vertical space */
        }),
        vscode.languages.registerCodeLensProvider({ language: 'markdown' }, provider)
    );
    return provider;
}
