-- CEO Cockpit — premissas e lista de equipamentos do calculador de ROI.
--
-- Até aqui esse estado vivia só em localStorage (favo_ceo_roi_<tenant>), o que
-- significa que ele não era dado do restaurante: abrir o CFO em outro laptop
-- mostrava o cockpit vazio, e limpar o navegador apagava a análise. Uma decisão
-- de compra de equipamento é exatamente o tipo de coisa que o dono revisita
-- semanas depois, de outro lugar.
--
-- Uma linha por tenant. As máquinas ficam em JSONB em vez de tabela filha
-- porque a tela sempre carrega e salva a lista inteira de uma vez — normalizar
-- só acrescentaria joins e ids sem nenhum consumidor para eles.
--
-- Ordem de aplicação: o código tolera a tabela ausente (o fetch falha, cai no
-- localStorage e a tela segue funcionando como antes), então esta migração pode
-- ser aplicada antes ou depois do deploy. Aplicar antes evita que o operador
-- veja um período sem sincronização entre dispositivos.

CREATE TABLE IF NOT EXISTS r7_ledger_ceo_roi (
  tenant_id  UUID PRIMARY KEY,
  rate       NUMERIC NOT NULL DEFAULT 18,   -- custo de mão de obra por hora, carregado
  weeks      INTEGER NOT NULL DEFAULT 52,   -- semanas de operação por ano
  machines   JSONB   NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT r7_ledger_ceo_roi_machines_is_array
    CHECK (jsonb_typeof(machines) = 'array')
);

ALTER TABLE r7_ledger_ceo_roi ENABLE ROW LEVEL SECURITY;

-- Mesma política das outras r7_ledger_*: quem está logado enxerga só os tenants
-- de que participa. Sem policy para anon — o cockpit exige login como o resto
-- do app.
DROP POLICY IF EXISTS r7_ledger_ceo_roi_tenant_rw ON r7_ledger_ceo_roi;
CREATE POLICY r7_ledger_ceo_roi_tenant_rw ON r7_ledger_ceo_roi
  FOR ALL TO authenticated
  USING      (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin())
  WITH CHECK (tenant_id::text IN (SELECT r7_get_my_tenant_ids()) OR r7_is_super_admin());
