-- ─── Restrict write operations to service_role only ─────────────────────────
-- The backend uses the service_role key which bypasses RLS,
-- but these policies ensure the frontend anon key cannot write directly.

-- signals
CREATE POLICY "signals_insert" ON signals FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "signals_update" ON signals FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "signals_delete" ON signals FOR DELETE TO service_role USING (true);

-- trades
CREATE POLICY "trades_insert" ON trades FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "trades_update" ON trades FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "trades_delete" ON trades FOR DELETE TO service_role USING (true);

-- positions
CREATE POLICY "positions_insert" ON positions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "positions_update" ON positions FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "positions_delete" ON positions FOR DELETE TO service_role USING (true);

-- news_cache
CREATE POLICY "news_cache_insert" ON news_cache FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "news_cache_update" ON news_cache FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "news_cache_delete" ON news_cache FOR DELETE TO service_role USING (true);

-- harvest_config (may already have policies from earlier fix — drop first)
DROP POLICY IF EXISTS "harvest_config_insert" ON harvest_config;
DROP POLICY IF EXISTS "harvest_config_update" ON harvest_config;
DROP POLICY IF EXISTS "harvest_config_delete" ON harvest_config;
CREATE POLICY "harvest_config_insert" ON harvest_config FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "harvest_config_update" ON harvest_config FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "harvest_config_delete" ON harvest_config FOR DELETE TO service_role USING (true);

-- withdrawals
CREATE POLICY "withdrawals_insert" ON withdrawals FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "withdrawals_update" ON withdrawals FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "withdrawals_delete" ON withdrawals FOR DELETE TO service_role USING (true);

-- agent_state
CREATE POLICY "agent_state_insert" ON agent_state FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "agent_state_update" ON agent_state FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "agent_state_delete" ON agent_state FOR DELETE TO service_role USING (true);

-- agent_prompts
CREATE POLICY "agent_prompts_insert" ON agent_prompts FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "agent_prompts_update" ON agent_prompts FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "agent_prompts_delete" ON agent_prompts FOR DELETE TO service_role USING (true);

-- education_cards
CREATE POLICY "education_cards_insert" ON education_cards FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "education_cards_update" ON education_cards FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "education_cards_delete" ON education_cards FOR DELETE TO service_role USING (true);
