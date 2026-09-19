import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'unriskomega-2026/core-case/portfolio-data');
const clients = JSON.parse(await readFile(path.join(base, 'clients.json'), 'utf8'));
const reference = JSON.parse(await readFile(path.join(base, 'reference.json'), 'utf8'));

// Same projection is applied to uploads in the application. Never ship account identifiers.
const redact = value => typeof value === 'string'
  ? value.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/g, '[account redacted]') : value;
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] != null).map(k => [k, redact(k === 'ViolationPath' && Array.isArray(obj[k]) ? JSON.stringify(obj[k].map(r => pick(r, ['FieldName','LeftValue','RightValue','Operator']))) : obj[k])]));
const list = value => Array.isArray(value) ? value : [];
const sanitized = clients.map(c => ({
  ...pick(c, ['ClientId','ClientRef','IsClientACompany','RegulatoryClientTypeName','ReportingCurrency','RiskProfileId','RiskProfileName','EsgProfileId','EsgProfileName','ProfilingDateUtc','AssetsUnderManagementInDefaultCurrency','LiquidityInDefaultCurrency']),
  ClientNotes: list(c.ClientNotes).map(n => pick(n, ['Note','CreatedByDateUTC'])),
  Tags: list(c.Tags).map(t => pick(t, ['TagName','TagTypeName'])),
  Portfolios: list(c.Portfolios).map(p => ({
    ...pick(p, ['PortfolioId','PortfolioNr','Name','IsConsolidated','PortfolioCurrency','StrategicAssetAllocationId','InvestmentServiceName','StrategyName','ReferenceCurrency','AssetsUnderManagementInDefaultCurrency','LiquidityInDefaultCurrency','Volatility','ExpectedReturn','ValueAtRisk','FactoryDateUtc']),
    SecurityPositions: list(p.SecurityPositions).map(s => pick(s, ['SecurityId','SecurityName','Isin','SecurityIsin','SecurityTypeName','PriceDateUtc','Currency','Quantity','PricePerUnit','TotalAmountInPortfolioCurrency','PortfolioValuePercentage'])),
    AccountPositions: list(p.AccountPositions).map(a => pick(a, ['Currency','TotalAmountInPortfolioCurrency','PortfolioValuePercentage'])),
    PerformanceHistory: list(p.PerformanceHistory).map(h => pick(h, ['Date','Value'])),
  })),
  Proposals: list(c.Proposals).map(p => pick(p, ['ProposalId','PortfolioId','ProposalStatusName','Currency','ProposedDateUTC','FinalizedDateUTC','Reason'])),
  SuitabilityViolations: list(c.SuitabilityViolations).map(v => pick(v, ['Id','PortfolioId','RuleCode','RuleDescription','ViolationPath','Severity','LastViolatedDateUTC'])),
  TransactionCount: list(c.Transactions).length,
}));

const funds = new Map();
for (const row of reference.FundUnbundlingMappings ?? []) {
  const fund = funds.get(row.FundSecurityId) ?? { id: row.FundSecurityId, total: 0, sectors: {}, regions: {} };
  fund.total += row.Weight;
  for (const [field, target] of [['IndustryName','sectors'],['CountryGroupName','regions']]) {
    const category = row[field] || 'Not classified';
    fund[target][category] = (fund[target][category] || 0) + row.Weight;
  }
  funds.set(row.FundSecurityId, fund);
}
const fundHoldings = JSON.parse(await readFile(path.join(root, 'data/fund-holdings.json'), 'utf8'));
for (const snapshot of fundHoldings) {
  if (!reference.Securities.some(s => s.Isin === snapshot.isin && s.SecurityTypeName === 'Investment fund')) throw new Error(`Unknown fund ISIN: ${snapshot.isin}`);
  const weights = snapshot.holdings.map(h => h.weight);
  if (!weights.length || weights.some(w => !Number.isFinite(w) || w < 0 || w > 1) || weights.reduce((a,b) => a+b,0) > 1.001) throw new Error(`Invalid fund weights: ${snapshot.isin}`);
}
const cacheDir = path.join(root, '.cache/fund-holdings');
try {
  for (const filename of await readdir(cacheDir)) {
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]\.json$/.test(filename)) continue;
    const snapshot = JSON.parse(await readFile(path.join(cacheDir, filename), 'utf8'));
    const index = fundHoldings.findIndex(s => s.isin === snapshot.isin);
    if (index < 0) fundHoldings.push(snapshot);
    else if (snapshot.asOf > fundHoldings[index].asOf) fundHoldings[index] = snapshot;
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const output = {
  version: '134d6ff',
  clients: sanitized,
  reference: {
    Securities: reference.Securities.map(s => pick(s, ['Id','Isin','Name','SecurityTypeName','Currency','PriceDateUtc','EndOfDayPrice','MaturityDateUtc','SAA_AssetClassName','IndustryName','CountryName','InRecommendationList','PRC','SustainabilityScore'])),
    RiskProfiles: reference.RiskProfiles,
    EsgProfiles: reference.EsgProfiles,
    StrategicAssetAllocations: reference.StrategicAssetAllocations,
    FundBreakdowns: [...funds.values()],
    FundHoldings: fundHoldings,
  },
};
await mkdir(path.join(root, 'public/data'), { recursive: true });
await writeFile(path.join(root, 'public/data/case-data.json'), JSON.stringify(output));
console.log(`Prepared ${sanitized.length} customers and ${funds.size} fund breakdowns. Account identifiers excluded.`);
