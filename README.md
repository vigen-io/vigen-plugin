# Vigen for Claude

Make short videos presented by your own talking avatar. Your koi (an avatar from one photo, with a voice cloned
from one recording) says the script with [Vigen](https://vigen.io) lipsync, and Claude edits it in a template's
style: camera cuts, captions, cards, stock footage, music and sound effects.

## Install

**Claude desktop app:** Customize → Plugins → Add → Add marketplace → `vigen-io/vigen-plugin`, then install
**vigen**. Make videos in the **Code** tab: the plugin runs tools on your computer.

**Claude Code (terminal):**

    claude plugin marketplace add https://github.com/vigen-io/vigen-plugin.git
    claude plugin install vigen@vigen

You also need Node.js 20+, ffmpeg and Python with Pillow, and a Vigen account. Step-by-step guide:
https://vigen.io/api-docs#claude-skill

## Use

Ask in plain words, for example "make a 15-second video asking viewers to like and subscribe", or pick a template
at https://vigen.io/templates and press **Recreate with Claude**.

## Update

    claude plugin marketplace update vigen
    claude plugin update vigen@vigen

In the desktop app: Customize → Plugins → the vigen marketplace → Check for updates.
