-- Add dictionary fields for payroll service code rules
-- pay_divisor: how to convert units -> hours (hours = units / pay_divisor when pay_divisor != 1)
-- credit_value: how much each unit contributes to tier credit (tierCredits = units * credit_value)

ALTER TABLE payroll_service_code_rules
  ADD COLUMN pay_divisor INT NOT NULL DEFAULT 1,
  ADD COLUMN credit_value DECIMAL(18,11) NOT NULL DEFAULT 0;

