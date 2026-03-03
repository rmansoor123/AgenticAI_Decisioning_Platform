/**
 * Output Validator — Lightweight schema validation for agent outputs.
 * Provides Zod-like validation without external dependencies.
 * Singleton: getOutputValidator()
 */

// Schema definitions for agent decision outputs
const DECISION_SCHEMA = {
  type: 'object',
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['APPROVE', 'REJECT', 'REVIEW', 'BLOCK', 'MONITOR', 'ESCALATE'] },
    confidence: { type: 'number', min: 0, max: 1 },
    reason: { type: 'string' },
    originalAction: { type: 'string' },
  }
};

const OBSERVATION_SCHEMA = {
  type: 'object',
  required: ['summary'],
  properties: {
    success: { type: 'boolean' },
    summary: { type: 'string' },
    riskScore: { type: 'number', min: 0, max: 100 },
    recommendation: { type: 'string' },
    confidence: { type: 'number', min: 0, max: 1 },
    key_findings: { type: 'array' },
    risk_score: { type: 'number', min: 0, max: 100 },
  }
};

const PLAN_SCHEMA = {
  type: 'object',
  required: ['actions'],
  properties: {
    goal: { type: 'string' },
    reasoning: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tool'],
        properties: {
          tool: { type: 'string' },
          params: { type: 'object' },
          rationale: { type: 'string' },
        }
      }
    }
  }
};

const THINK_SCHEMA = {
  type: 'object',
  required: ['understanding'],
  properties: {
    understanding: { type: 'string' },
    key_risks: { type: 'array' },
    confidence: { type: 'number', min: 0, max: 1 },
    suggested_approach: { type: 'string' },
  }
};

const REFLECT_SCHEMA = {
  type: 'object',
  properties: {
    shouldRevise: { type: 'boolean' },
    revisedAction: { type: 'string', nullable: true },
    revisedConfidence: { type: 'number', min: 0, max: 1, nullable: true },
    concerns: { type: 'array' },
    contraArgument: { type: 'string' },
    reflectionConfidence: { type: 'number', min: 0, max: 1 },
  }
};

class OutputValidator {
  constructor() {
    this.schemas = new Map([
      ['decision', DECISION_SCHEMA],
      ['observation', OBSERVATION_SCHEMA],
      ['plan', PLAN_SCHEMA],
      ['think', THINK_SCHEMA],
      ['reflect', REFLECT_SCHEMA],
    ]);
    this.stats = { validated: 0, passed: 0, failed: 0, coerced: 0 };
  }

  validate(data, schemaName) {
    const schema = this.schemas.get(schemaName);
    if (!schema) return { valid: true, errors: [], data };
    this.stats.validated++;
    const errors = this._validateValue(data, schema, schemaName);
    if (errors.length === 0) {
      this.stats.passed++;
      return { valid: true, errors: [], data };
    }
    this.stats.failed++;
    return { valid: false, errors, data };
  }

  validateAndCoerce(data, schemaName) {
    const schema = this.schemas.get(schemaName);
    if (!schema) return { valid: true, errors: [], data };
    this.stats.validated++;
    const errors = [];
    const coerced = this._coerceValue(data, schema, schemaName, errors);
    if (errors.length === 0) {
      this.stats.passed++;
    } else {
      this.stats.coerced++;
    }
    return { valid: true, errors, data: coerced, wasCoerced: errors.length > 0 };
  }

  registerSchema(name, schema) {
    this.schemas.set(name, schema);
  }

  _validateValue(value, schema, path) {
    const errors = [];
    if (value === null || value === undefined) {
      if (!schema.nullable) errors.push({ path, message: 'Value is null/undefined', expected: schema.type });
      return errors;
    }
    if (schema.type === 'object') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push({ path, message: 'Expected object', got: typeof value });
        return errors;
      }
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in value) || value[key] === undefined) {
            errors.push({ path: `${path}.${key}`, message: `Required field missing: ${key}` });
          }
        }
      }
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in value) {
            errors.push(...this._validateValue(value[key], propSchema, `${path}.${key}`));
          }
        }
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push({ path, message: 'Expected array', got: typeof value });
      } else if (schema.items) {
        value.forEach((item, i) => {
          errors.push(...this._validateValue(item, schema.items, `${path}[${i}]`));
        });
      }
    } else if (schema.type === 'string') {
      if (typeof value !== 'string') errors.push({ path, message: 'Expected string', got: typeof value });
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push({ path, message: `Value must be one of: ${schema.enum.join(', ')}`, got: value });
      }
    } else if (schema.type === 'number') {
      if (typeof value !== 'number') errors.push({ path, message: 'Expected number', got: typeof value });
      else {
        if (schema.min !== undefined && value < schema.min) errors.push({ path, message: `Value ${value} below minimum ${schema.min}` });
        if (schema.max !== undefined && value > schema.max) errors.push({ path, message: `Value ${value} above maximum ${schema.max}` });
      }
    } else if (schema.type === 'boolean') {
      if (typeof value !== 'boolean') errors.push({ path, message: 'Expected boolean', got: typeof value });
    }
    return errors;
  }

  _coerceValue(value, schema, path, errors) {
    if (value === null || value === undefined) return schema.type === 'object' ? {} : schema.type === 'array' ? [] : schema.type === 'string' ? '' : schema.type === 'number' ? 0 : schema.type === 'boolean' ? false : value;
    if (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
      const result = { ...value };
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in result)) {
            const propSchema = schema.properties?.[key];
            if (propSchema?.type === 'string') result[key] = '';
            else if (propSchema?.type === 'number') result[key] = 0;
            else if (propSchema?.type === 'array') result[key] = [];
            else result[key] = null;
            errors.push({ path: `${path}.${key}`, message: `Coerced missing required field: ${key}` });
          }
        }
      }
      return result;
    }
    if (schema.type === 'number' && typeof value === 'string') {
      const num = parseFloat(value);
      if (!isNaN(num)) { errors.push({ path, message: 'Coerced string to number' }); return Math.max(schema.min || -Infinity, Math.min(schema.max || Infinity, num)); }
    }
    if (schema.type === 'string' && typeof value !== 'string') {
      errors.push({ path, message: 'Coerced to string' });
      return String(value);
    }
    return value;
  }

  getStats() { return { ...this.stats, schemaCount: this.schemas.size }; }
}

let instance = null;
export function getOutputValidator() {
  if (!instance) instance = new OutputValidator();
  return instance;
}
export default { OutputValidator, getOutputValidator };
