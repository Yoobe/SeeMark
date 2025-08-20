(function(){
	const vscode = acquireVsCodeApi();

	let currentText = '';
	let focusedLineIndex = -1;

	function escapeHtml(value){
		return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
	}

	function renderInlineDom(lineText){
		// Very small inline renderer without regex-heavy parsing
		// Handles: headings (#), bold **text** and __text__, italic *text* and _text_, code `text`, and links [t](u)
		const root = document.createElement('span');
		if (/^#{1,6} /.test(lineText)){
			const level = lineText.match(/^#+/)[0].length;
			const h = document.createElement('h'+level);
			h.appendChild(renderSpans(lineText.slice(level+1)));
			return h;
		}

		root.appendChild(renderSpans(lineText));
		return root;
	}

	function renderSpans(text){
		const frag = document.createDocumentFragment();
		let i = 0;
		while(i < text.length){
			const ch = text[i];
			// code span
			if (ch === '`'){
				const end = text.indexOf('`', i+1);
				if (end !== -1){
					const code = document.createElement('code');
					code.textContent = text.slice(i+1, end);
					frag.appendChild(code);
					i = end + 1;
					continue;
				}
			}
			// link [text](url)
			if (ch === '['){
				const closeBracket = text.indexOf(']', i+1);
				const openParen = closeBracket !== -1 ? text.indexOf('(', closeBracket+1) : -1;
				const closeParen = openParen !== -1 ? text.indexOf(')', openParen+1) : -1;
				if (closeBracket !== -1 && openParen === closeBracket+1 && closeParen !== -1){
					const a = document.createElement('a');
					a.textContent = text.slice(i+1, closeBracket);
					a.href = text.slice(openParen+1, closeParen);
					a.target = '_blank';
					a.rel = 'noreferrer noopener';
					frag.appendChild(a);
					i = closeParen + 1;
					continue;
				}
			}
			// bold ** or __
			if ((ch === '*' && text[i+1] === '*') || (ch === '_' && text[i+1] === '_')){
				const delim = ch+ch;
				const end = text.indexOf(delim, i+2);
				if (end !== -1){
					const strong = document.createElement('strong');
					strong.appendChild(renderSpans(text.slice(i+2, end)));
					frag.appendChild(strong);
					i = end + 2;
					continue;
				}
			}
			// italic * or _
			if (ch === '*' || ch === '_'){
				const end = text.indexOf(ch, i+1);
				if (end !== -1){
					const em = document.createElement('em');
					em.appendChild(renderSpans(text.slice(i+1, end)));
					frag.appendChild(em);
					i = end + 1;
					continue;
				}
			}
			// plain text run
			let j = i;
			while(j < text.length){
				const c = text[j];
				if (c === '`' || c === '[' || c === '*' || c === '_') break;
				j++;
			}
			const span = document.createElement('span');
			span.textContent = text.slice(i, j);
			frag.appendChild(span);
			i = j;
		}
		return frag;
	}

	function render(){
		const container = document.getElementById('app');
		container.innerHTML = '';
		const lines = currentText.split(/\n/);
		lines.forEach((line, idx) => {
			const div = document.createElement('div');
			div.className = 'line' + (idx === focusedLineIndex ? ' focused' : '');
			if (idx === focusedLineIndex){
				const textarea = document.createElement('textarea');
				textarea.value = line;
				textarea.rows = 1;
				textarea.addEventListener('input', () => {
					lines[idx] = textarea.value;
					currentText = lines.join('\n');
					vscode.postMessage({ type: 'edit', text: currentText });
					textarea.style.height = 'auto';
					textarea.style.height = textarea.scrollHeight + 'px';
				});
				textarea.addEventListener('blur', () => { focusedLineIndex = -1; render(); });
				setTimeout(() => {
					textarea.focus();
					textarea.selectionStart = textarea.value.length;
					textarea.selectionEnd = textarea.value.length;
					textarea.style.height = 'auto';
					textarea.style.height = textarea.scrollHeight + 'px';
				}, 0);
				div.appendChild(textarea);
			} else {
				div.appendChild(renderInlineDom(line));
				div.addEventListener('click', () => { focusedLineIndex = idx; render(); });
			}
			container.appendChild(div);
		});

		if (!document.getElementById('fm-debug')){
			const tag = document.createElement('div');
			tag.id = 'fm-debug';
			tag.textContent = 'Focused Markdown webview';
			document.body.appendChild(tag);
		}
	}

	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.type === 'init'){
			currentText = message.text || '';
			render();
		}
	});

})();

