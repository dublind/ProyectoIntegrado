// Runner for Azure DevOps MCP Server
const fs = require('fs');
const path = require('path');

// Cargar variables locales desde .env si existe
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const [key, ...vals] = line.trim().split('=');
    if (key && vals.length && !process.env[key]) {
      process.env[key] = vals.join('=');
    }
  }
}

if (!process.env.PERSONAL_ACCESS_TOKEN && process.env.AZURE_DEVOPS_PAT) {
  process.env.PERSONAL_ACCESS_TOKEN = Buffer.from(':' + process.env.AZURE_DEVOPS_PAT).toString('base64');
}

process.argv = [
  process.argv[0],
  'azure-devops',
  process.env.AZURE_DEVOPS_ORG || 'ignaciosalinas',
  '--authentication',
  'pat'
];

try {
  require('C:\\Users\\fabia\\AppData\\Local\\npm-cache\\_npx\\38bc830389a22c8c\\node_modules\\@azure-devops\\mcp\\dist\\index.js');
} catch (err) {
  console.error("Error starting Azure DevOps MCP server:", err);
  process.exit(1);
}
