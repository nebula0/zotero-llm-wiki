// Bundled by build.mjs into addon/lib/anthropic.js, which exposes the SDK as a global in the plugin scope
import Anthropic from '@anthropic-ai/sdk';

globalThis.Anthropic = Anthropic;
