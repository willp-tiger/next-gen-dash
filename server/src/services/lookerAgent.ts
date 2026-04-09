/**
 * Claude agent that builds Looker dashboards via tool-use.
 *
 * The user describes what they want, Claude decides which Looker tools
 * to call, the backend executes those calls, and returns the results
 * back to Claude until the dashboard is complete.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import * as looker from './looker.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// === Tool definitions that mirror Looker MCP server capabilities ===

const LOOKER_TOOLS: Tool[] = [
  {
    name: 'get_models',
    description: 'List all available LookML models and their explores. Call this first to discover what data is available.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_explore_fields',
    description: 'Get all dimensions and measures for a specific explore. Use this to understand what fields are available for building queries and dashboard tiles.',
    input_schema: {
      type: 'object' as const,
      properties: {
        model: { type: 'string', description: 'LookML model name' },
        explore: { type: 'string', description: 'Explore name' },
      },
      required: ['model', 'explore'],
    },
  },
  {
    name: 'run_query',
    description: 'Run an ad-hoc query to preview data before adding it to a dashboard. Use this to verify fields and filters work correctly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        model: { type: 'string', description: 'LookML model name' },
        explore: { type: 'string', description: 'Explore name (view)' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields to query (dimensions and measures)' },
        filters: { type: 'object', additionalProperties: { type: 'string' }, description: 'Looker filter expressions keyed by field name' },
        sorts: { type: 'array', items: { type: 'string' }, description: 'Sort fields (append " desc" for descending)' },
        limit: { type: 'number', description: 'Max rows to return (default 100)' },
      },
      required: ['model', 'explore', 'fields'],
    },
  },
  {
    name: 'create_dashboard',
    description: 'Create a new empty Looker dashboard. Returns the dashboard ID to use when adding elements.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Dashboard title' },
        description: { type: 'string', description: 'Dashboard description' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_dashboard_element',
    description: 'Add a visualization tile to a Looker dashboard. Specify the query fields, chart type, and position.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dashboardId: { type: 'string', description: 'Dashboard ID' },
        title: { type: 'string', description: 'Tile title' },
        type: { type: 'string', enum: ['vis', 'text'], description: 'Element type' },
        model: { type: 'string', description: 'LookML model name' },
        explore: { type: 'string', description: 'Explore name' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields for the query' },
        filters: { type: 'object', additionalProperties: { type: 'string' }, description: 'Filter expressions' },
        sorts: { type: 'array', items: { type: 'string' }, description: 'Sort fields' },
        limit: { type: 'number', description: 'Row limit' },
        visType: {
          type: 'string',
          enum: ['looker_bar', 'looker_line', 'looker_area', 'single_value', 'looker_pie', 'looker_grid', 'looker_column', 'looker_scatter'],
          description: 'Visualization type',
        },
        pivots: { type: 'array', items: { type: 'string' }, description: 'Pivot dimensions' },
      },
      required: ['dashboardId', 'title', 'model', 'explore', 'fields'],
    },
  },
  {
    name: 'add_dashboard_filter',
    description: 'Add a filter control to a Looker dashboard so users can interactively filter the data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dashboardId: { type: 'string', description: 'Dashboard ID' },
        title: { type: 'string', description: 'Filter label' },
        dimension: { type: 'string', description: 'Dimension field to filter on (e.g., "view_name.field_name")' },
        model: { type: 'string', description: 'LookML model name' },
        explore: { type: 'string', description: 'Explore name' },
        type: { type: 'string', enum: ['field_filter', 'date_filter'], description: 'Filter type' },
        defaultValue: { type: 'string', description: 'Default filter value' },
      },
      required: ['dashboardId', 'title', 'dimension', 'model', 'explore'],
    },
  },
  {
    name: 'get_dashboard_url',
    description: 'Get the URL of a completed Looker dashboard. Call this when the dashboard is finished to give the user a link.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dashboardId: { type: 'string', description: 'Dashboard ID' },
      },
      required: ['dashboardId'],
    },
  },
  {
    name: 'list_dashboards',
    description: 'List existing Looker dashboards. Use this if the user wants to modify an existing dashboard.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// === Tool execution ===

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case 'get_models':
        return JSON.stringify(await looker.getModels());
      case 'get_explore_fields':
        return JSON.stringify(await looker.getExploreFields(input.model, input.explore));
      case 'run_query':
        return JSON.stringify(await looker.runQuery({
          model: input.model,
          view: input.explore,
          fields: input.fields,
          filters: input.filters,
          sorts: input.sorts,
          limit: input.limit,
        }));
      case 'create_dashboard':
        return JSON.stringify(await looker.createDashboard(input.title, input.description));
      case 'add_dashboard_element':
        return JSON.stringify(await looker.addDashboardElement(input as any));
      case 'add_dashboard_filter':
        return JSON.stringify(await looker.addDashboardFilter(input as any));
      case 'get_dashboard_url':
        return JSON.stringify({ url: await looker.getDashboardUrl(input.dashboardId) });
      case 'list_dashboards':
        return JSON.stringify(await looker.listDashboards());
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: e.message || String(e) });
  }
}

// === System prompt for the dashboard-building agent ===

const SYSTEM_PROMPT = `You are a Looker dashboard builder. The user describes what they want to monitor, and you build a real Looker dashboard for them by calling tools.

## Workflow
1. **Discover**: Call get_models to see available data, then get_explore_fields to understand dimensions and measures
2. **Plan**: Decide which tiles, chart types, and filters the dashboard needs based on the user's request
3. **Verify** (optional): Run a quick run_query to preview data and confirm fields work
4. **Build**: Call create_dashboard, then add_dashboard_element for each tile, and add_dashboard_filter for interactive filters
5. **Deliver**: Call get_dashboard_url and share the link with the user

## Guidelines
- Always discover available fields before building. Don't guess field names.
- Choose appropriate chart types: single_value for KPIs, looker_line for trends, looker_bar/looker_column for comparisons, looker_pie for proportions
- Add filters for key dimensions (e.g., make, model, date) so users can slice the data
- Keep dashboards focused: 4-8 tiles is ideal
- Give tiles clear, descriptive titles
- After building, always get the dashboard URL and share it

## When chatting (not building)
If the user asks a question or wants recommendations before building, respond conversationally. Only call tools when you're ready to act.`;

// === Agent loop ===

export interface AgentMessage {
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: { name: string; input: any; result: string }[];
  dashboardUrl?: string;
}

// Conversation state per user
const conversations = new Map<string, MessageParam[]>();

export async function chat(userId: string, userMessage: string): Promise<AgentMessage> {
  const history = conversations.get(userId) || [];
  history.push({ role: 'user', content: userMessage });

  const toolCalls: { name: string; input: any; result: string }[] = [];
  let dashboardUrl: string | undefined;
  let finalText = '';

  // Agent loop: keep going until Claude responds with just text (no tool calls)
  let messages = [...history];
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: LOOKER_TOOLS,
      messages,
    });

    // Collect text blocks
    const textBlocks = response.content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text');
    const toolUseBlocks = response.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');

    if (textBlocks.length > 0) {
      finalText = textBlocks.map(b => b.text).join('\n');
    }

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      // Push assistant message to history
      history.push({ role: 'assistant', content: response.content });
      break;
    }

    // Execute tool calls
    const toolResults: MessageParam = {
      role: 'user',
      content: [],
    };

    // Push assistant message with tool_use blocks
    messages.push({ role: 'assistant', content: response.content });

    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(toolUse.name, toolUse.input as Record<string, any>);
      toolCalls.push({ name: toolUse.name, input: toolUse.input, result });

      // Check for dashboard URL in results
      if (toolUse.name === 'get_dashboard_url') {
        try {
          const parsed = JSON.parse(result);
          if (parsed.url) dashboardUrl = parsed.url;
        } catch {}
      }

      (toolResults.content as any[]).push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push(toolResults);
  }

  // Save conversation (trim to last 20 messages)
  if (messages.length > 20) {
    conversations.set(userId, messages.slice(-20));
  } else {
    conversations.set(userId, messages);
  }

  return {
    role: 'assistant',
    text: finalText || 'Done.',
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    dashboardUrl,
  };
}

export function resetConversation(userId: string) {
  conversations.delete(userId);
}

export { LOOKER_TOOLS };
