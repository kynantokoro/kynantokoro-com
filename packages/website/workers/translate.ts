/**
 * Translation API Worker
 *
 * Secure server-side translation endpoint for Sanity Studio
 * Uses Sanity authentication tokens for authorization
 */

import Anthropic from '@anthropic-ai/sdk';

interface TranslateRequest {
  sourceLanguage: 'English' | 'Japanese';
  targetLanguage: 'English' | 'Japanese';
  title: string;
  content: string; // Portable Text JSON string
}

interface Env {
  ANTHROPIC_API_KEY: string;
  SANITY_PROJECT_ID: string;
  SANITY_DATASET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      // Verify Sanity authentication token
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const sanityToken = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token has access to our specific Sanity project
      // This prevents users from other Sanity projects from using our translation API
      const sanityVerifyResponse = await fetch(
        `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2021-06-07/data/query/${env.SANITY_DATASET}?query=*[_id == "_.config"][0]`,
        {
          headers: {
            Authorization: `Bearer ${sanityToken}`,
          },
        }
      );

      if (!sanityVerifyResponse.ok) {
        return new Response(
          JSON.stringify({
            error: 'Invalid Sanity token',
            message: 'You must have access to this Sanity project to use the translation API'
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Parse request body
      const body = await request.json() as TranslateRequest;
      const { sourceLanguage, targetLanguage, title, content } = body;

      if (!title || !content || !sourceLanguage || !targetLanguage) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Call Anthropic API
      const anthropic = new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
      });

      const prompt = `Translate the following ${sourceLanguage} blog post to ${targetLanguage}.

The content is in Sanity Portable Text format (JSON). You must:
1. Translate ONLY the text content within "text" fields
2. Preserve ALL structure, styles, marks, images, and custom blocks exactly as they are
3. Do NOT modify any field names, _type values, _key values, or other metadata
4. Keep all non-text blocks (images, embeds, etc.) completely unchanged

Return ONLY valid JSON in this format (no markdown code blocks):
{
  "title": "[translated title]",
  "content": [translated Portable Text JSON array]
}

${sourceLanguage} content:
Title: ${title}

Portable Text Content:
${content}`;

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text from response
      const firstBlock = message.content[0];
      if (firstBlock.type !== 'text') {
        throw new Error('Unexpected response format from Claude API');
      }
      const translationText = firstBlock.text;

      // Parse JSON response
      let translatedTitle: string;
      let translatedContent: string;

      try {
        // Clean up potential markdown code blocks
        let cleanJson = translationText.trim();
        if (cleanJson.startsWith('```json')) {
          cleanJson = cleanJson.replace(/^```json\n/, '').replace(/\n```$/, '');
        } else if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        const parsed = JSON.parse(cleanJson);
        translatedTitle = parsed.title || title;
        translatedContent = typeof parsed.content === 'string'
          ? parsed.content
          : JSON.stringify(parsed.content);
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Invalid JSON response from translation');
      }

      return new Response(
        JSON.stringify({
          title: translatedTitle,
          content: translatedContent,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('Translation error:', error);
      return new Response(
        JSON.stringify({
          error: 'Translation failed',
          message: (error as Error).message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
