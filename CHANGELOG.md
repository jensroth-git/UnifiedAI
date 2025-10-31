# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-31

### Added
- Initial release of unified-ai package
- Support for OpenAI
- Support for Anthropic Claude
- Support for Google Gemini
- Unified message format across all providers
- Tool/function calling support with Zod schema validation
- Multi-turn tool calling with automatic roundtrips
- Image support for vision models
- Audio support for Google Gemini
- Stop signals for graceful interruption
- Rate limiting handling for Claude API
- Text streaming callbacks
- Force stop capability for tools
- Comprehensive TypeScript types
- Full documentation and examples

### Features
- Cross-provider compatibility with single API
- Automatic message format conversion
- Built-in rate limit retry logic
- Zod schema to JSON schema conversion
- Support for system messages across all providers
- Tool execution with parameter validation

[1.0.0]: https://github.com/jensroth-git/UnifiedAI/releases/tag/v1.0.0

