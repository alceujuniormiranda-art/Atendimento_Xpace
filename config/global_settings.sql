-- Tabela para configurações globais do bot
CREATE TABLE IF NOT EXISTS global_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir configuração inicial do bot (ligado por padrão)
INSERT INTO global_settings (key, value)
VALUES ('bot_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
