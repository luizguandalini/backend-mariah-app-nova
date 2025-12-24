-- ⚠️ CUIDADO: Este script deleta TODAS as tabelas e dados do banco!
-- Use apenas em ambiente de desenvolvimento para limpar o banco completamente
-- Após executar, o TypeORM recriará todas as tabelas na próxima inicialização

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
