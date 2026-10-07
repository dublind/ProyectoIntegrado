// Helper CLI to query and manage Azure DevOps work items directly
const https = require('https');
const fs = require('fs');
const path = require('path');

// Cargar variables desde .env si existe
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

const ORG = process.env.AZURE_DEVOPS_ORG || 'ignaciosalinas';
const PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'Proyecto Integrado';
const PAT = process.env.AZURE_DEVOPS_PAT;

if (!PAT) {
  console.error('Error: AZURE_DEVOPS_PAT no configurado en entorno ni en .env');
  process.exit(1);
}

const AUTH_HEADER = 'Basic ' + Buffer.from(':' + PAT).toString('base64');

function apiRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://dev.azure.com/${encodeURIComponent(ORG)}/${encodeURIComponent(PROJECT)}/${endpoint}`);
    const options = {
      method: method,
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ statusCode: res.statusCode, data: parsed });
          }
        } catch (e) {
          reject({ statusCode: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getWorkItem(id) {
  const data = await apiRequest(`_apis/wit/workitems/${id}?$expand=all&api-version=7.0`);
  return {
    id: data.id,
    type: data.fields['System.WorkItemType'],
    title: data.fields['System.Title'],
    state: data.fields['System.State'],
    assignedTo: data.fields['System.AssignedTo']?.displayName,
    iteration: data.fields['System.IterationPath'],
    tags: data.fields['System.Tags'],
    description: data.fields['System.Description'],
    acceptanceCriteria: data.fields['Microsoft.VSTS.Common.AcceptanceCriteria']
  };
}

async function listSprintWorkItems(sprintName = 'Sprint 1') {
  const wiql = {
    query: `SELECT [System.Id], [System.Title], [System.State], [System.IterationPath], [System.AssignedTo] FROM WorkItems WHERE [System.TeamProject] = '${PROJECT}' AND [System.IterationPath] UNDER '${PROJECT}\\${sprintName}' ORDER BY [System.Id]`
  };
  const queryRes = await apiRequest(`_apis/wit/wiql?api-version=7.0`, 'POST', wiql);
  const ids = (queryRes.workItems || []).map(w => w.id);
  if (!ids.length) return [];
  
  const batchRes = await apiRequest(`_apis/wit/workitemsbatch?api-version=7.0`, 'POST', {
    ids,
    fields: ['System.Id', 'System.Title', 'System.WorkItemType', 'System.State', 'System.IterationPath', 'System.AssignedTo', 'System.Tags', 'Microsoft.VSTS.Common.AcceptanceCriteria', 'System.Description']
  });

  return batchRes.value.map(w => ({
    id: w.id,
    type: w.fields['System.WorkItemType'],
    title: w.fields['System.Title'],
    state: w.fields['System.State'],
    assignedTo: w.fields['System.AssignedTo']?.displayName,
    tags: w.fields['System.Tags'],
    acceptanceCriteria: w.fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
    description: w.fields['System.Description']
  }));
}

async function main() {
  const cmd = process.argv[2] || 'sprint';
  if (cmd === 'get') {
    const id = process.argv[3];
    const wi = await getWorkItem(id);
    console.log(JSON.stringify(wi, null, 2));
  } else if (cmd === 'sprint') {
    const sprint = process.argv[3] || 'Sprint 1';
    const items = await listSprintWorkItems(sprint);
    console.log(JSON.stringify(items, null, 2));
  }
}

if (require.main === module) {
  main().catch(err => console.error(err));
}

module.exports = { getWorkItem, listSprintWorkItems, apiRequest };
