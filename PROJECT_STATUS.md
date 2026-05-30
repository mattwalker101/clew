# Project Status 
This version of `clew` is paused. 
The original `clew` vision explored a broader portable knowledge base / agent operating system concept. 
During planning, a smaller and more immediately useful product emerged: a portable skill library and exporter for AI coding CLIs. 
That focused product is being developed separately as `threadkit`. 
This repo is preserved for future reference. 
The broader `clew` vision may resume later after the smaller skill portability layer proves useful. 

## Current Decision 
- Pause this version of `clew`. 
- Preserve the current work and architecture notes. 
- Start `threadkit` as a separate focused project. 
- Do not delete this repo. 
- Do not migrate all code automatically. 
- Harvest only useful ideas manually. 

## Relationship to threadkit

`threadkit` captures the most immediately useful piece of the original `clew` vision: 
- reusable skill inventory 
- canonical skill format 
- profiles 
- exporters for Claude, Codex, Gemini CLI, and OpenCode 
- safe install/audit behavior `threadkit` may eventually become part of a future `clew`, but it should begin as a separate small project.
