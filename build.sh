#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
root="$PWD"
doClean=""
doSetup=""
doHelp=""

showHelp() {
    echo "Usage: bash build.sh [-c] [-s] [-h]"
    echo "  -c  clean: delete previous build output first"
    echo "  -s  setup: ask for the bot token and Telegram account, save static/config.json"
    echo "  -h  show this help"
    echo "Node.js 22 or newer is installed automatically if missing."
    echo "Setup also runs when static/config.json is missing."
    echo "Build output: $root/node_modules"
}

checkNode() {
    command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'
}

installNode() {
    case "$(uname -s)" in
        Linux) os="linux" ;;
        Darwin) os="darwin" ;;
        *) echo "Error: unsupported OS, install Node.js 22 or newer from https://nodejs.org"; exit 1 ;;
    esac
    case "$(uname -m)" in
        x86_64 | amd64) arch="x64" ;;
        aarch64 | arm64) arch="arm64" ;;
        armv7l) arch="armv7l" ;;
        *) echo "Error: unsupported CPU, install Node.js 22 or newer from https://nodejs.org"; exit 1 ;;
    esac
    for tool in curl tar; do
        command -v "$tool" >/dev/null 2>&1 || { echo "Error: $tool is required to install Node.js, install it with your package manager"; exit 1; }
    done
    if command -v sha256sum >/dev/null 2>&1; then hasher="sha256sum"; else hasher="shasum -a 256"; fi

    base="https://nodejs.org/dist/latest-v24.x"
    temp="$(mktemp -d)"
    echo "Installing Node.js to $HOME/.local/lib/nodejs"
    curl -fsSL "$base/SHASUMS256.txt" -o "$temp/SHASUMS256.txt" || { echo "Error: could not download Node.js"; exit 1; }
    line="$(grep " node-v[0-9.]*-$os-$arch.tar.gz\$" "$temp/SHASUMS256.txt")"
    if [ -z "$line" ]; then echo "Error: no Node.js build for $os $arch"; exit 1; fi
    file="${line##* }"
    curl -fsSL "$base/$file" -o "$temp/$file" || { echo "Error: could not download Node.js"; exit 1; }
    (cd "$temp" && echo "$line" | $hasher -c >/dev/null) || { echo "Error: Node.js checksum mismatch"; exit 1; }

    target="$HOME/.local/lib/nodejs"
    mkdir -p "$target" "$HOME/.local/bin" || exit 1
    tar -xzf "$temp/$file" -C "$target" || exit 1
    dir="${file%.tar.gz}"
    for tool in node npm npx; do
        ln -sf "$target/$dir/bin/$tool" "$HOME/.local/bin/$tool"
    done
    rm -rf "$temp"
    case ":$PATH:" in
        *":$HOME/.local/bin:"*) ;;
        *) echo "Add this line to your shell profile so node is found later: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
    esac
    export PATH="$HOME/.local/bin:$PATH"
}

while getopts ":csh" opt; do
    case "$opt" in
        c) doClean="1" ;;
        s) doSetup="1" ;;
        h) doHelp="1" ;;
        *) echo "Unknown flag: -$OPTARG. Use -h for help."; exit 1 ;;
    esac
done
shift $((OPTIND - 1))
if [ $# -gt 0 ]; then echo "Unknown argument: $1. Use -h for help."; exit 1; fi

if [ -n "$doHelp" ]; then
    showHelp
    exit 0
fi

if [ -n "$doClean" ] && [ -d node_modules ]; then rm -rf node_modules; fi
checkNode || installNode
checkNode || { echo "Error: Node.js 22 or newer is required and could not be installed. Install it from https://nodejs.org and run build.sh again."; exit 1; }
npm install || exit 1
if [ -z "$doSetup" ] && [ ! -f static/config.json ]; then doSetup="1"; fi
if [ -z "$doSetup" ]; then echo "Found static/config.json, skipping setup. Run bash build.sh -s to set it up again."; fi
if [ -n "$doSetup" ]; then node start.js -s || exit 1; fi
exit 0
