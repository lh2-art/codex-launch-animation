import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import storeModule from './store.cjs';
import skinVeilModule from '../skin-veil.cjs';

const root = process.env.LAUNCH_ANIMATION_PLUGIN_ROOT || path.dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(root,'.codex-plugin/plugin.json'),'utf8')).version;
const store = storeModule.createStore();
const skinVeil=skinVeilModule.createSkinVeilStore();
const uri = `ui://chatgpt-launch-animation/control-v${version}.html`;
const mimeType = 'text/html;profile=mcp-app';
const server = new McpServer({ name: 'chatgpt-launch-animation', version, title: '启动动画' }, {
  capabilities: {
    experimental: { 'openai/settings': { readTool: 'animation_settings_read', updateTool: 'animation_settings_update' } },
    extensions: { 'openai/settings': { readTool: 'animation_settings_read', updateTool: 'animation_settings_update' } }
  }
});
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const mutating = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const appOnly = { ui: { visibility: ['app'] } };
const veilOutput={available:z.boolean(),themeId:z.string(),opacity:z.number().int().min(0).max(100)};
server.registerTool('get_skin_veil',{title:'读取皮肤遮罩',description:'读取当前本机皮肤的遮罩不透明度。',inputSchema:{},outputSchema:veilOutput,annotations:readOnly,_meta:appOnly},async()=>({content:[],structuredContent:skinVeil.read()}));
server.registerTool('set_skin_veil',{title:'调节皮肤遮罩',description:'设置当前皮肤遮罩，0% 透明、100% 最深，并自动保存。',inputSchema:{themeId:z.string().min(1).max(256),opacity:z.number().int().min(0).max(100)},outputSchema:veilOutput,annotations:mutating,_meta:appOnly},async patch=>({content:[],structuredContent:skinVeil.update(patch)}));
const uiMetadata = {
  ui: { resourceUri: uri }, 'openai/outputTemplate': uri,
  'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] }
};
const settingsShape = {
  motion:z.object({gatherSpeed:z.number().finite().min(.25).max(3).optional(),rotationSpeed:z.number().finite().min(.25).max(2).optional()}).strict().optional(),
  colors:z.object(Object.fromEntries(['openingStart','openingEnd','openingRing','brandIcon','motto','name','caption'].map(key=>[key,z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()]))).strict().optional(),
  autoPlay: z.boolean().optional(),
  uiLanguage: z.enum(['zh-CN', 'en']).optional(),
  layout: z.object(Object.fromEntries(['x','y','openingIconSize','iconSize','iconX','iconY','iconGap','nameGap','captionGap'].map(key => [key, z.number().finite().optional()]))).strict().optional(),
  text: z.object(Object.fromEntries(['motto','name','caption'].map(key => [key, z.object({
    font: z.string().optional(), fontSize: z.number().finite().optional(), spacing: z.number().finite().optional(), x: z.number().finite().optional(), y: z.number().finite().optional()
  }).strict().optional()]))).strict().optional(),
  schemaVersion: z.literal(2).optional()
};
const output = { settings: z.object(settingsShape) };
const result = settings => ({ content: [{ type: 'text', text: settings.autoPlay ? '启动动画已启用。' : '启动动画已禁用。' }], structuredContent: { settings }, _meta: { 'launchAnimation/version': version } });

server.registerResource('animation-control', uri, { title: '启动动画控制页', mimeType }, async () => ({
  contents: [{ uri, mimeType, text: fs.readFileSync(path.join(root, 'control.html'), 'utf8'), _meta: {
    ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: ['blob:'] } },
    'openai/widgetCSP': { connect_domains: [], resource_domains: ['blob:'] },
    'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] },
    'openai/widgetDescription': '调整本机 ChatGPT 启动动画的字体、大小、位置和间隔，在应用内预览，并控制自动播放。'
  } }]
}));
server.registerTool('open_animation_control', {
  title: '启动动画', description: '打开 ChatGPT 应用内的启动动画控制页，可预览动画并调整字体、字号、位置、间距、图标大小和启用状态。',
  inputSchema: {}, outputSchema: output, annotations: readOnly, _meta: uiMetadata
}, async () => result(store.read()));
server.registerTool('preview_animation', {
  title: '预览启动动画', description: '在 ChatGPT 应用内打开完整启动动画预览，不启动额外应用窗口。',
  inputSchema: {}, outputSchema: { ...output, preview: z.boolean() }, annotations: readOnly,
  _meta: { ui: { resourceUri: uri }, 'openai/outputTemplate': uri }
}, async () => ({ ...result(store.read()), structuredContent: { settings: store.read(), preview: true } }));
server.registerTool('get_animation_configuration', {
  title: '读取动画配置', description: '读取当前本机启动动画配置。', inputSchema: {}, outputSchema: output, annotations: readOnly, _meta: appOnly
}, async () => result(store.read()));
server.registerTool('update_animation_configuration', {
  title: '保存动画配置', description: '只更新本机启动动画的外观与自动播放配置。', inputSchema: { settings: z.object(settingsShape).strict() },
  outputSchema: output, annotations: mutating, _meta: appOnly
}, async ({ settings }) => result(store.update(settings)));
server.registerTool('read_animation_media', {
  title: '读取本地预览素材', description: '为应用内预览读取固定视频的一小段数据，不访问任意文件。',
  inputSchema: { offset: z.number().int().min(0), length: z.number().int().min(1).max(524288) },
  outputSchema: { data: z.string(), total: z.number(), next: z.number() }, annotations: readOnly, _meta: appOnly
}, async ({ offset, length }) => {
  const filename = path.join(root, 'assets', 'gpt6-stars-full.mp4');
  const total = fs.statSync(filename).size;
  if (offset > total) throw new Error('Video offset is out of range.');
  const handle = fs.openSync(filename, 'r');
  const bytes = Buffer.alloc(Math.min(length, total - offset));
  let count;
  try { count = fs.readSync(handle, bytes, 0, bytes.length, offset); } finally { fs.closeSync(handle); }
  return { content: [], structuredContent: { data: bytes.subarray(0, count).toString('base64'), total, next: offset + count } };
});
server.registerTool('animation_settings_read', {
  title: '读取插件设置', description: '向 ChatGPT 原生插件设置页提供启用开关和控制页、预览按钮。', inputSchema: {},
  outputSchema: { schema: z.record(z.string(), z.unknown()), values: z.record(z.string(), z.unknown()), layout: z.array(z.record(z.string(), z.unknown())) },
  annotations: readOnly, _meta: appOnly
}, async () => ({ content: [], structuredContent: {
  schema: { type: 'object', properties: { autoPlay: { type: 'boolean', title: '启用启动动画', description: '从原桌面 ChatGPT 快捷方式打开时自动播放。' } } },
  values: { autoPlay: store.read().autoPlay },
  layout: [{ kind: 'group', title: '启动动画', items: [
    { kind: 'property', property: 'autoPlay' },
    { kind: 'tool', tool: 'open_animation_control', description: '调整字体、字号、位置、间距和图标大小。' },
    { kind: 'tool', tool: 'preview_animation', description: '在软件内播放完整动画。' }
  ] }]
} }));
server.registerTool('animation_settings_update', {
  title: '更新插件设置', description: '保存原生插件设置页的启动动画开关。', inputSchema: { set: z.object({ autoPlay: z.boolean().optional() }).strict() },
  outputSchema: { values: z.object({ autoPlay: z.boolean() }) }, annotations: mutating, _meta: appOnly
}, async ({ set }) => ({ content: [], structuredContent: { values: { autoPlay: store.update(set).autoPlay } } }));

server.connect(new StdioServerTransport()).catch(error => { console.error(error.message); process.exitCode = 1; });
process.stdin.on('end', () => server.close());
