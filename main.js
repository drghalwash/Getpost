const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const axios = require('axios');

const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function postExists(postId) {
    const { data, error } = await supabase
        .from('posts')
        .select('id')
        .eq('id', postId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error(`⚠️ Error checking post ${postId}:`, error);
        return true; // Assume it exists to avoid duplicate insertions
    }

    return !!data; // If data exists, post exists
}

async function fetchFacebookPosts(url = null, retryCount = 0) {
    try {
        if (!url) {
            url = `https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/posts?access_token=${FACEBOOK_ACCESS_TOKEN}&fields=id,message,created_time&limit=2`;
        }

        const response = await axios.get(url);
        const posts = response.data.data;

        for (const post of posts) {
            if (await postExists(post.id)) {
                console.log(`⏩ Skipping existing post: ${post.id}`);
                continue;
            }

            const { data, error } = await supabase
                .from('posts')
                .insert([
                    {
                        id: post.id,
                        message: post.message || 'No message',
                        created_time: new Date(post.created_time).toISOString()
                    }
                ]);

            if (error) {
                console.error(`❌ Error saving post ${post.id}:`, error);
            } else {
                console.log(`✅ Saved post: ${post.id}`);
            }
        }

        console.log('🚀 Batch processed.');

        // Delay before fetching the next batch
        await new Promise(resolve => setTimeout(resolve, 5000));

        if (response.data.paging && response.data.paging.next) {
            console.log('🔄 Fetching next batch...');
            await fetchFacebookPosts(response.data.paging.next);
        } else {
            console.log('✅ All posts fetched.');
        }

    } catch (error) {
        console.error('❌ Error fetching posts:', error.response?.data || error.message);

        if (retryCount < 3) {
            console.log(`🔁 Retrying (${retryCount + 1}/3)...`);
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before retry
            await fetchFacebookPosts(url, retryCount + 1);
        } else {
            console.error('🚨 Max retries reached. Stopping.');
        }
    }
}

fetchFacebookPosts();
