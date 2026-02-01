# Scaffolding System

Loopwork provides a built-in scaffolding system to generate files from templates.

## Usage

```bash
loopwork scaffold <template-name> <name> [options]
```

Example:

```bash
loopwork scaffold feature MyFeature
```

This will look for a template named `feature` in `.specs/templates` and generate files with `MyFeature` as the context name.

## Templates

Templates are stored in `.specs/templates` (relative to your project root).

A template is a directory containing files. Files can be:
- **Static files**: Copied as-is.
- **Templates**: Files ending in `.hbs` are processed by Handlebars. The `.hbs` extension is stripped from the output filename.

### Variables

- `{{name}}`: The name passed to the command.
- Any other flags passed to the CLI are available as variables (e.g. `--type=api` becomes `{{type}}`).

### Helpers

- `{{uppercase name}}`: Uppercase the string.
- `{{lowercase name}}`: Lowercase the string.
- `{{capitalize name}}`: Capitalize the first letter.

## Example Template

Structure:
```
.specs/templates/component/
  ├── {{name}}.tsx.hbs
  └── {{name}}.css
```

`{{name}}.tsx.hbs`:
```tsx
import React from 'react';
import './{{name}}.css';

export const {{name}} = () => {
  return <div className="{{lowercase name}}">{{name}}</div>;
};
```

Running `loopwork scaffold component Button` will create:
- `Button.tsx`
- `Button.css`
