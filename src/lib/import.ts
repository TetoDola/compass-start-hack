import type { Row, Dataset, FundBreakdown } from './types';
import { list, redact } from './format';

const numericKeys = new Set(['ClientId','PortfolioId','ProposalId','SecurityId','Id','AssetsUnderManagementInDefaultCurrency','LiquidityInDefaultCurrency','Quantity','PricePerUnit','TotalAmountInPortfolioCurrency','PortfolioValuePercentage','Volatility','ExpectedReturn','ValueAtRisk','Value','TargetPercentage','MinPercentage','MaxPercentage','MaxVola','MaxPRC','EquityQuoteInPercent']);
function check(value: unknown, path: string) {
  if (Array.isArray(value)) { value.forEach((v, i) => check(v, `${path}[${i}]`)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if (numericKeys.has(key) && v != null && (typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`${path}.${key} must be a number or null.`);
    check(v, `${path}.${key}`);
  }
}
const pick = (row: Row, keys: string[]): Row => Object.fromEntries(keys.filter(k => row[k] != null).map(k => {
  const value = k === 'ViolationPath' && Array.isArray(row[k]) ? JSON.stringify(row[k].map((r: Row) => pick(r, ['FieldName', 'LeftValue', 'RightValue', 'Operator']))) : row[k];
  if (['LeftValue','RightValue'].includes(k) && Array.isArray(value) && value.every(v => v == null || ['string','number','boolean'].includes(typeof v))) return [k, redact(JSON.stringify(value))];
  if (typeof value === 'object') throw new Error(`${k} must be a simple value.`);
  return [k, typeof value === 'string' ? redact(value) : value];
}));
function records(row: Row, key: string) {
  if (row[key] != null && !Array.isArray(row[key])) throw new Error(`${key} must be an array or null.`);
  const result = list(row[key]);
  if (result.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error(`${key} must contain objects.`);
  return result;
}

/** A clients array reuses the current reference universe. An envelope replaces it explicitly. */
export function parseDatasetUpload(text: string, reference: Dataset['reference']): { clients: Row[]; reference: Dataset['reference']; suppliedReference: boolean } {
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (Array.isArray(data)) return { clients: parseCustomerUpload(text), reference, suppliedReference: false };
  if (!data || !Array.isArray(data.clients) || !data.reference || typeof data.reference !== 'object') throw new Error('Expected a clients array or { clients, reference } with a Securities list.');
  const raw = data.reference;
  if (!Array.isArray(raw.Securities)) throw new Error('The supplied reference needs a Securities array.');
  check(raw, 'reference');
  const ids = new Set<number>();
  const securities = records(raw, 'Securities').map(s => {
    if (!Number.isSafeInteger(s.Id) || ids.has(s.Id)) throw new Error('Securities need unique numeric Id values.'); ids.add(s.Id);
    return pick(s, ['Id','Isin','Name','SecurityTypeName','Currency','PriceDateUtc','EndOfDayPrice','MaturityDateUtc','SAA_AssetClassName','IndustryName','CountryName','InRecommendationList']);
  });
  const funds = new Map<number, FundBreakdown>();
  for (const row of records(raw, 'FundUnbundlingMappings')) {
    if (!Number.isSafeInteger(row.FundSecurityId) || typeof row.Weight !== 'number' || !Number.isFinite(row.Weight) || row.Weight < 0) throw new Error('Invalid fund category mapping.');
    const fund = funds.get(row.FundSecurityId) || { id: row.FundSecurityId, total: 0, sectors: Object.create(null), regions: Object.create(null) };
    fund.total += row.Weight;
    for (const [field, dim] of [['IndustryName', 'sectors'], ['CountryGroupName', 'regions']] as const) { const label = typeof row[field] === 'string' ? row[field] : 'Not classified'; fund[dim][label] = (fund[dim][label] || 0) + row.Weight; }
    funds.set(row.FundSecurityId, fund);
  }
  if (!funds.size) for (const row of records(raw, 'FundBreakdowns')) {
    if (!Number.isSafeInteger(row.id) || !Number.isFinite(row.total) || row.total < 0) throw new Error('Invalid prepared fund breakdown.');
    const breakdown: FundBreakdown = { id: row.id, total: row.total, sectors: Object.create(null), regions: Object.create(null) };
    for (const dim of ['sectors', 'regions'] as const) {
      if (!row[dim] || typeof row[dim] !== 'object' || Array.isArray(row[dim])) throw new Error('Invalid fund category dimension.');
      for (const [label, weight] of Object.entries(row[dim])) { if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) throw new Error('Invalid fund category weight.'); breakdown[dim][label] = weight; }
      if (Math.abs(Object.values(breakdown[dim]).reduce((n, w) => n+w, 0) - row.total) > Math.max(.00001, row.total * .001)) throw new Error('Fund categories do not reconcile to their total.');
    }
    funds.set(row.id, breakdown);
  }
  return { clients: parseCustomerUpload(JSON.stringify(data.clients)), suppliedReference: true, reference: {
    Securities: securities, FundBreakdowns: [...funds.values()],
    RiskProfiles: records(raw, 'RiskProfiles').map(r => pick(r, ['Id', 'Name', 'RiskLevel', 'MaxVola', 'MaxPRC', 'EquityQuoteInPercent'])),
    StrategicAssetAllocations: records(raw, 'StrategicAssetAllocations').map(r => ({ ...pick(r, ['Id', 'Name']), Mappings: records(r, 'Mappings').map(m => pick(m, ['Dimension', 'Category', 'TargetPercentage', 'MinPercentage', 'MaxPercentage'])) })),
    // Constituent snapshots are obtained through the verified server resolver, independently of security IDs.
    FundHoldings: reference.FundHoldings,
  } };
}
export function parseCustomerUpload(text: string): Row[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose a clients.json file.'); }
  if (!Array.isArray(data) || !data.length) throw new Error('Expected a non-empty array of customers, like clients.json.');
  if (data.length > 1000) throw new Error('Please import up to 1,000 customers at a time.');
  check(data, 'customers');
  const ids = new Set();
  return data.map((c, index) => {
    if (!c || typeof c !== 'object' || typeof c.ClientId !== 'number' || typeof c.ClientRef !== 'string') throw new Error(`Customer ${index + 1} needs a numeric ClientId and a ClientRef.`);
    if (ids.has(c.ClientId)) throw new Error(`Duplicate ClientId ${c.ClientId} in this file.`);
    ids.add(c.ClientId);
    const portfolioIds = new Set();
    return {
      ...pick(c, ['ClientId','ClientRef','IsClientACompany','RegulatoryClientTypeName','ReportingCurrency','RiskProfileId','RiskProfileName','EsgProfileName','ProfilingDateUtc','AssetsUnderManagementInDefaultCurrency','LiquidityInDefaultCurrency']),
      ClientNotes: records(c, 'ClientNotes').map(n => pick(n, ['Note','CreatedByDateUTC'])),
      Tags: records(c, 'Tags').map(t => pick(t, ['TagName','TagTypeName'])),
      Portfolios: records(c, 'Portfolios').map(p => {
        if (typeof p.PortfolioId !== 'number' || portfolioIds.has(p.PortfolioId)) throw new Error(`${c.ClientRef} needs unique numeric PortfolioId values.`);
        portfolioIds.add(p.PortfolioId);
        return {
          ...pick(p, ['PortfolioId','PortfolioNr','Name','IsConsolidated','PortfolioCurrency','StrategicAssetAllocationId','InvestmentServiceName','StrategyName','ReferenceCurrency','AssetsUnderManagementInDefaultCurrency','LiquidityInDefaultCurrency','Volatility','ExpectedReturn','ValueAtRisk','FactoryDateUtc']),
          SecurityPositions: records(p, 'SecurityPositions').map(s => pick(s, ['SecurityId','SecurityName','Isin','SecurityIsin','SecurityTypeName','PriceDateUtc','Currency','Quantity','PricePerUnit','TotalAmountInPortfolioCurrency','PortfolioValuePercentage'])),
          AccountPositions: records(p, 'AccountPositions').map(a => pick(a, ['Currency','TotalAmountInPortfolioCurrency','PortfolioValuePercentage'])),
          PerformanceHistory: records(p, 'PerformanceHistory').map(h => pick(h, ['Date','Value'])),
        };
      }),
      Proposals: records(c, 'Proposals').map(p => pick(p, ['ProposalId','PortfolioId','ProposalStatusName','Currency','ProposedDateUTC','FinalizedDateUTC','Reason'])),
      SuitabilityViolations: records(c, 'SuitabilityViolations').map(v => pick(v, ['Id','PortfolioId','RuleCode','RuleDescription','ViolationPath','Severity','LastViolatedDateUTC'])),
      TransactionCount: records(c, 'Transactions').length,
    };
  });
}
