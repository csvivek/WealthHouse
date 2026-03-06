-- Add parsed_data column to statement_imports to store parsed transactions before approval
ALTER TABLE statement_imports ADD COLUMN parsed_data jsonb DEFAULT NULL;

-- Add index for faster queries
CREATE INDEX idx_statement_imports_parse_status ON statement_imports(parse_status);
