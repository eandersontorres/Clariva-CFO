-- Limpeza pontual: linhas PENDING do Plaid que já tinham gêmea postada.
--
-- Sintoma: transações "PENDING" paradas há uma semana na tela do TorresBee.
-- Causa: o Bank of America expõe cada cartão de portador como uma conta
-- própria (••8349, ••9489, ••5982) mas posta a compra liquidada na conta CORP
-- consolidada (••7042). As três contas de portador pararam de responder em
-- 29/08/2026. Do ponto de vista do Plaid a pendente e a postada são transações
-- diferentes, em contas diferentes, então `removed` nunca veio para a pendente
-- — ela ficou órfã, e a mesma despesa passou a contar duas vezes no P&L.
--
-- APLICADO EM PRODUÇÃO em 03/09/2026: 18 linhas, -US$ 2.214,40, de 07/08 a
-- 29/08/2026. As linhas removidas estão em r7_ledger_txns_backup_pending_dupes.
--
-- O conserto permanente está em api/plaid-sync.js (pending_transaction_id +
-- varredura de pendente velha com gêmea postada). Este arquivo só existe para
-- registrar o que foi feito na mão e como desfazer.

CREATE TABLE IF NOT EXISTS r7_ledger_txns_backup_pending_dupes AS
SELECT t.*, now() AS backed_up_at FROM r7_ledger_transactions t WHERE false;

INSERT INTO r7_ledger_txns_backup_pending_dupes
SELECT t.*, now()
FROM r7_ledger_transactions t
WHERE t.tenant_id = '5dc58fa8-0a0a-4d24-8906-e32755e36e93'
  AND t.id LIKE 'plaid_%'
  AND t.notes ILIKE 'Pending%'
  -- Valor exato de propósito: uma gorjeta lançada depois do hold muda o total,
  -- e casar por aproximação aqui apagaria despesa de verdade.
  AND EXISTS (
    SELECT 1 FROM r7_ledger_transactions o
    WHERE o.tenant_id = t.tenant_id
      AND o.id LIKE 'plaid_%' AND o.id <> t.id
      AND o.amount = t.amount
      AND o.date BETWEEN t.date AND t.date + 7
      AND (o.notes IS NULL OR o.notes NOT ILIKE 'Pending%')
  );

DELETE FROM r7_ledger_transactions t
USING r7_ledger_txns_backup_pending_dupes b
WHERE t.id = b.id AND t.tenant_id = b.tenant_id;

-- ── DESFAZER ──────────────────────────────────────────────────────────────────
/*
INSERT INTO r7_ledger_transactions
SELECT id, tenant_id, date, description, amount, category_id, recurring_id,
       account_id, account, reconciled, prior_period, tags, source, notes,
       parent_id, posted, posted_at, created_at, updated_at
FROM r7_ledger_txns_backup_pending_dupes
ON CONFLICT (id) DO NOTHING;
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- Segunda parte: duplicatas JÁ POSTADAS da mesma migração do BoA.
--
-- Achado ao investigar as pendentes. Entre 18 e 28/08/2026 o BoA reportou a
-- mesma compra DUAS vezes já liquidada — uma na conta do cartão do portador
-- (••8349, ••9489, ••5982) e outra na conta CORP consolidada (••7042), com
-- data, descrição e valor idênticos. 45 pares, US$ 5.902,50 de despesa contada
-- em dobro em agosto.
--
-- Decisão do Anderson (03/09/2026): fica o lado CORP ••7042, porque as contas
-- de cartão pararam de reportar em 29/08 e tudo de setembro em diante já chega
-- só por ela — agosto fica consistente com o resto do ano.
--
-- Casamento por data + descrição + valor EXATOS. A janela de ±7 dias que usei
-- primeiro produzia falso positivo (ANTHROPIC US$ 21,32 casando com VERCEL US$
-- 21,32 cinco dias depois); mesmo dia e mesma descrição não têm esse problema.
--
-- APLICADO EM PRODUÇÃO em 03/09/2026. Backup em r7_ledger_txns_backup_boa_card_dupes.
-- Antes de apagar: 17 bills que apontavam para a linha do cartão foram
-- repontadas para a gêmea CORP, e a categoria/reconciliação do lado do cartão
-- foi copiada para a gêmea quando esta estava sem categoria.

CREATE TABLE IF NOT EXISTS r7_ledger_txns_backup_boa_card_dupes AS
SELECT t.*, now() AS backed_up_at FROM r7_ledger_transactions t WHERE false;

INSERT INTO r7_ledger_txns_backup_boa_card_dupes
SELECT c.*, now()
FROM r7_ledger_transactions c
WHERE c.tenant_id = '5dc58fa8-0a0a-4d24-8906-e32755e36e93'
  AND c.id LIKE 'plaid_%'
  AND (c.account LIKE '%8349%' OR c.account LIKE '%9489%' OR c.account LIKE '%5982%')
  AND (c.notes IS NULL OR c.notes NOT ILIKE 'Pending%')
  AND EXISTS (
    SELECT 1 FROM r7_ledger_transactions o
    WHERE o.tenant_id = c.tenant_id AND o.id LIKE 'plaid_%' AND o.id <> c.id
      AND o.account LIKE '%7042%'
      AND o.amount = c.amount AND o.date = c.date AND o.description = c.description
      AND (o.notes IS NULL OR o.notes NOT ILIKE 'Pending%')
  );

-- (ver o histórico do git para o UPDATE das bills e a cópia de categoria)

DELETE FROM r7_ledger_transactions t
USING r7_ledger_txns_backup_boa_card_dupes b
WHERE t.id = b.id AND t.tenant_id = b.tenant_id;
