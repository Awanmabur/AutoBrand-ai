const env = require('../../config/env');
const toolsService = require('../../services/mcp/mcpTools.service');
const { tools } = require('../../services/mcp/mcpToolDefinitions');
const { challenge } = require('../../middlewares/mcpAuth');
const { resource } = require('../../services/mcp/mcpOAuth.service');
const { assertPlanFeature } = require('../../services/usageLimitService');

const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSIONS = ['2025-11-25','2025-06-18','2025-03-26'];
const serverInfo = { name: 'AutoBrand AI', version: '1.6.3' };
const instructions = 'Use AutoBrand AI as the source of truth for brand permissions, connected social accounts, durable media, drafts, scheduling, publishing and analytics. Read brands/accounts before writes. Upload ChatGPT files with upload_media before using their media IDs. Publishing and scheduling affect real external social accounts.';

function jsonRpc(id, result, { modern = false, cacheable = false } = {}) {
  const next = modern ? { resultType: 'complete', ...result } : result;
  if (modern) {
    if (cacheable) { next.ttlMs = 0; next.cacheScope = 'private'; }
    next._meta = { ...(next._meta || {}), 'io.modelcontextprotocol/serverInfo': serverInfo };
  }
  return { jsonrpc:'2.0', id, result: next };
}
function rpcError(id, code, message, data) { return { jsonrpc:'2.0', id: id ?? null, error:{ code, message, ...(data ? {data}: {}) } }; }
function modernRequest(body) { return body?.params?._meta?.['io.modelcontextprotocol/protocolVersion'] === MODERN_VERSION || body?.method === 'server/discover' || String(body?.params?._meta?.['io.modelcontextprotocol/protocolVersion'] || '').startsWith('2026-'); }
function toolResult(data, text) { return { content:[{type:'text',text:text || JSON.stringify(data)}], structuredContent: data && typeof data === 'object' ? data : {data} }; }
function authToolResult(scope, description) { return { content:[{type:'text',text:description}], isError:true, _meta:{'mcp/www_authenticate':[`${challenge(scope)}, error="insufficient_scope", error_description="${String(description).replace(/"/g,"'")}"`]} }; }
function toolByName(name) { return tools.find((tool) => tool.name === name); }

function validationError(path, message) {
  return Object.assign(new Error(`${path}: ${message}`), { status: 400, code: 'MCP_INVALID_ARGUMENTS' });
}

function resolveSchemaRef(root, schema) {
  if (!schema?.$ref) return schema || {};
  const match = String(schema.$ref).match(/^#\/\$defs\/([^/]+)$/);
  if (!match) throw validationError('$', `Unsupported schema reference ${schema.$ref}`);
  const resolved = root?.$defs?.[match[1]];
  if (!resolved) throw validationError('$', `Unknown schema reference ${schema.$ref}`);
  return resolved;
}

function validateSchemaValue(root, schemaInput, value, path = '$') {
  const schema = resolveSchemaRef(root, schemaInput);
  if (Array.isArray(schema.anyOf)) {
    const errors = [];
    for (const candidate of schema.anyOf) {
      try { validateSchemaValue(root, candidate, value, path); return; }
      catch (error) { errors.push(error); }
    }
    throw validationError(path, 'value does not match any allowed schema');
  }

  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw validationError(path, 'must be an object');
    const properties = schema.properties || {};
    for (const field of schema.required || []) {
      if (value[field] === undefined || value[field] === null || value[field] === '') throw validationError(`${path}.${field}`, 'is required');
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key));
      if (unknown.length) throw validationError(path, `unknown field(s): ${unknown.join(', ')}`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (value[key] !== undefined) validateSchemaValue(root, child, value[key], `${path}.${key}`);
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw validationError(path, 'must be an array');
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) throw validationError(path, `must contain at least ${schema.minItems} item(s)`);
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) throw validationError(path, `must contain at most ${schema.maxItems} item(s)`);
    if (schema.uniqueItems) {
      const keys = value.map((item) => JSON.stringify(item));
      if (new Set(keys).size !== keys.length) throw validationError(path, 'must not contain duplicate items');
    }
    if (schema.items) value.forEach((item, index) => validateSchemaValue(root, schema.items, item, `${path}[${index}]`));
    return;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') throw validationError(path, 'must be a string');
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) throw validationError(path, `must contain at least ${schema.minLength} character(s)`);
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) throw validationError(path, `must contain at most ${schema.maxLength} character(s)`);
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw validationError(path, `must be one of: ${schema.enum.join(', ')}`);
    if (schema.format === 'uri') { try { new URL(value); } catch (_error) { throw validationError(path, 'must be a valid URI'); } }
    if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw validationError(path, 'must be a YYYY-MM-DD date');
    if (schema.format === 'date-time') { const parsed = Date.parse(value); if (Number.isNaN(parsed) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) throw validationError(path, 'must be an ISO-8601 date-time with timezone'); }
    return;
  }

  if (schema.type === 'integer') {
    if (!Number.isInteger(value)) throw validationError(path, 'must be an integer');
    if (Number.isFinite(schema.minimum) && value < schema.minimum) throw validationError(path, `must be >= ${schema.minimum}`);
    if (Number.isFinite(schema.maximum) && value > schema.maximum) throw validationError(path, `must be <= ${schema.maximum}`);
    return;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw validationError(path, 'must be a finite number');
    return;
  }

  if (schema.type === 'boolean' && typeof value !== 'boolean') throw validationError(path, 'must be a boolean');
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw validationError(path, `must be one of: ${schema.enum.join(', ')}`);
}

function validateArgs(tool, args) {
  const schema = tool.inputSchema || { type: 'object', properties: {} };
  const value = args === undefined ? {} : args;
  validateSchemaValue(schema, schema, value, '$');
  return value;
}
function hasScope(req, scope){ return Boolean(req.mcpAuth?.scopes?.includes(scope)); }
async function executeTool(req, name, args) {
  const tool=toolByName(name); if(!tool) throw Object.assign(new Error(`Unknown tool: ${name}`),{rpcCode:-32602,status:400});
  if(!req.mcpAuth) return authToolResult(tool.scope, req.mcpAuthError ? 'Your AutoBrand connection expired. Reconnect to continue.' : 'Connect your AutoBrand AI account to continue.');
  if(!hasScope(req, tool.scope)) return authToolResult(tool.scope, `AutoBrand authorization is missing ${tool.scope}. Reauthorize to continue.`);
  const input=validateArgs(tool,args);
  const user=req.mcpAuth.user;
  await assertPlanFeature(user, 'chatgptConnectorAccess', 'ChatGPT/Codex connector access');
  const handlers={
    get_profile:()=>toolsService.getProfile(user), list_brands:()=>toolsService.listBrands(user), get_brand:()=>toolsService.getBrand(user,input.brandId), list_connected_accounts:()=>toolsService.listConnectedAccounts(user,input.brandId),
    get_storage_status:()=>toolsService.getStorageStatus(user), list_media:()=>toolsService.listMedia(user,input), sync_media_to_drive:()=>toolsService.syncMediaToDrive(user,input),
    upload_media:()=>toolsService.uploadMedia(user,input), create_draft:()=>toolsService.createDraft(user,input), update_draft:()=>toolsService.updateDraft(user,input), publish_post:()=>toolsService.publishPost(user,input), publish_draft:()=>toolsService.publishDraft(user,input), schedule_post:()=>toolsService.schedulePost(user,input), schedule_draft:()=>toolsService.scheduleDraft(user,input),
    list_posts:()=>toolsService.listPosts(user,input), get_post:()=>toolsService.getPost(user,input.postId), list_scheduled_posts:()=>toolsService.listScheduledPosts(user,input), cancel_scheduled_post:()=>toolsService.cancelScheduledPost(user,input.postId),
    get_ai_brain:()=>toolsService.getAiBrain(user,input.brandId), update_ai_brain:()=>toolsService.updateAiBrain(user,input), run_ai_brain_now:()=>toolsService.runAiBrainNow(user,input.brandId), get_analytics_summary:()=>toolsService.getAnalyticsSummary(user,input)
  };
  const data=await handlers[name](); return toolResult(data);
}
function advertisedTools(){ return tools.map(({scope,...tool})=>tool); }
function discoverResult(){ return { supportedVersions:[MODERN_VERSION,...LEGACY_VERSIONS], capabilities:{tools:{listChanged:false}}, instructions }; }

async function handle(req,res,next){
  try{
    if(!env.mcpEnabled) return res.status(503).json(rpcError(req.body?.id,-32000,'AutoBrand MCP is disabled. Set MCP_ENABLED=true.'));
    if(req.method!=='POST') return res.status(405).set('Allow','POST').json({error:'method_not_allowed'});
    const body=req.body;
    if(!body || body.jsonrpc!=='2.0' || !body.method) return res.status(400).json(rpcError(body?.id,-32600,'Invalid JSON-RPC request.'));
    const modern=modernRequest(body);
    if(modern){
      const envelopeVersion=String(body.params?._meta?.['io.modelcontextprotocol/protocolVersion']||'');
      if(envelopeVersion && envelopeVersion!==MODERN_VERSION) return res.status(400).json(rpcError(body.id,-32022,'Unsupported MCP protocol version.',{supportedVersions:[MODERN_VERSION]}));
      const headerVersion=String(req.get('mcp-protocol-version')||'');
      if(headerVersion && headerVersion!==MODERN_VERSION) return res.status(400).json(rpcError(body.id,-32022,'Unsupported MCP protocol version.',{supportedVersions:[MODERN_VERSION]}));
      const headerMethod=String(req.get('mcp-method')||''); if(headerMethod && headerMethod!==body.method) return res.status(400).json(rpcError(body.id,-32020,'Mcp-Method header does not match request method.'));
    }
    if(body.method==='server/discover') return res.json(jsonRpc(body.id,discoverResult(),{modern:true,cacheable:true}));
    if(body.method==='initialize'){
      const offered=String(body.params?.protocolVersion||''); const selected=LEGACY_VERSIONS.includes(offered)?offered:LEGACY_VERSIONS[0];
      return res.json(jsonRpc(body.id,{protocolVersion:selected,capabilities:{tools:{listChanged:false}},serverInfo,instructions}));
    }
    if(body.method==='notifications/initialized') return res.status(202).end();
    if(body.method==='ping') return res.json(jsonRpc(body.id,{}, {modern}));
    if(body.method==='tools/list') return res.json(jsonRpc(body.id,{tools:advertisedTools()},{modern,cacheable:modern}));
    if(body.method==='tools/call'){
      const name=String(body.params?.name||''); const headerName=String(req.get('mcp-name')||''); if(modern && headerName && headerName!==name) return res.status(400).json(rpcError(body.id,-32020,'Mcp-Name header does not match tool name.'));
      try{ const result=await executeTool(req,name,body.params?.arguments||{}); return res.json(jsonRpc(body.id,result,{modern})); }
      catch(error){ const status=Number(error.status||500); const result=toolResult({error:error.message,code:error.code||'MCP_TOOL_ERROR'},error.message||'Tool call failed.'); result.isError=true; return res.status(status>=500?500:200).json(jsonRpc(body.id,result,{modern})); }
    }
    return res.status(404).json(rpcError(body.id,-32601,'Method not found.'));
  }catch(error){ return next(error); }
}
function docs(_req,res){ res.type('text/markdown').send(`# AutoBrand AI MCP\n\nEndpoint: \`${resource()}\`\n\nOAuth scopes:\n- \`autobrand.read\` — brands, accounts, posts and analytics\n- \`autobrand.write\` — media uploads and drafts\n- \`autobrand.publish\` — publish, schedule and cancel scheduled content\n\nUse ChatGPT Developer Mode or MCP Inspector to connect this endpoint. Publishing tools operate on real social accounts and inherit AutoBrand workspace permissions. ChatGPT can also upload generated images/videos into AutoBrand, Google Drive, or both before drafting, scheduling or publishing.`); }
module.exports={handle,docs,MODERN_VERSION,LEGACY_VERSIONS};
