import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';

const ajv = new Ajv({ 
  strict: false,
  allowUnionTypes: true,
  allErrors: true
});
addFormats(ajv);

const schema = JSON.parse(readFileSync('server.schema.json', 'utf-8'));
const data = JSON.parse(readFileSync('server.json', 'utf-8'));

const validate = ajv.compile(schema);
const valid = validate(data);

if (valid) {
  console.log('✓ server.json is valid!');
  process.exit(0);
} else {
  console.log('✗ server.json validation failed:');
  console.log(JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}
