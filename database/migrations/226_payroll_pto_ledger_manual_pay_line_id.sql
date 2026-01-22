-- Payroll: link PTO ledger entries to manual pay lines

ALTER TABLE payroll_pto_ledger
  ADD COLUMN manual_pay_line_id INT NULL AFTER request_id,
  ADD INDEX idx_pto_manual_pay_line (manual_pay_line_id),
  ADD CONSTRAINT fk_pto_manual_pay_line_id FOREIGN KEY (manual_pay_line_id) REFERENCES payroll_manual_pay_lines(id) ON DELETE CASCADE;

