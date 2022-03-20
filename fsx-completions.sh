#!/usr/bin/env bash

# Source this file in your shell startup. This assumes that `fsx` is in your PATH,
# and that it's pointing to dist/index.js

_comp_fsx() {
	# Check if at least one word has been typed
	if [ "${#COMP_WORDS[@]}" -gt 2 ]; then
		# Then we generate file paths
		CURSOR_WORD="${COMP_WORDS[$COMP_CWORD]}"
		FILES=()

		IFS='~~~' read -ra ADDR <<< "$(node dist/index.js shell-completion "$CURSOR_WORD")"
		for i in "${ADDR[@]}"; do
			FILES+=("$i")
		done

		COMPREPLY=($(compgen -W "${FILES[*]}" -- "${CURSOR_WORD}"))

		return
	fi

	COMPREPLY=($(compgen -W "upload download ls mv cp rm help" -- "${COMP_WORDS[1]}"))
}

complete -o nospace -F _comp_fsx fsx