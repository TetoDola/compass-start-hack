"""Read-only, aggregate audit of the cloned START Hack data; prints no account IDs."""
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "unriskomega-2026"
clients = json.loads((ROOT / "core-case/portfolio-data/clients.json").read_text())
reference = json.loads((ROOT / "core-case/portfolio-data/reference.json").read_text())


def rows(obj, key):
    return obj.get(key) or []


portfolios = [p for c in clients for p in rows(c, "Portfolios")]
securities = {s["Id"]: s for s in reference["Securities"]}
funds = defaultdict(list)
for row in reference["FundUnbundlingMappings"]:
    funds[row["FundSecurityId"]].append(row)
fund_totals = {key: sum(row["Weight"] for row in value) for key, value in funds.items()}
report = {
    "counts": {
        "clients": len(clients),
        "portfolios": len(portfolios),
        "clients_with_multiple_portfolios": sum(len(rows(c, "Portfolios")) > 1 for c in clients),
        **{key: sum(len(rows(c, key)) for c in clients) for key in (
            "Proposals", "Transactions", "SuitabilityViolations", "ClientNotes", "IndividualRuleOverrides"
        )},
        **{key: sum(len(rows(p, key)) for p in portfolios) for key in (
            "SecurityPositions", "AccountPositions", "PerformanceHistory"
        )},
        "reference_collections": {key: len(value) for key, value in reference.items()},
        "funds_with_breakdowns": len(funds),
    },
    "coverage_clients": {
        key: sum(bool(c.get(key)) for c in clients)
        for key in ("Proposals", "Transactions", "SuitabilityViolations", "ClientNotes", "Tags")
    },
    "null_client_fields": dict(Counter(key for c in clients for key, value in c.items() if value is None)),
    "portfolio_field_coverage": {
        key: sum(p.get(key) is not None for p in portfolios)
        for key in ("Volatility", "ExpectedReturn", "ValueAtRisk", "PerformanceYTD")
    },
    "proposal_statuses": dict(Counter(p.get("ProposalStatusName") for c in clients for p in rows(c, "Proposals"))),
    "unresolved_holding_security_ids": sum(
        p.get("SecurityId") not in securities for portfolio in portfolios for p in rows(portfolio, "SecurityPositions")
    ),
    "duplicate_isin_groups": sum(n > 1 for n in Counter(s.get("Isin") for s in securities.values()).values()),
    "fund_weight_sum_range": [min(fund_totals.values()), max(fund_totals.values())],
    "fund_rows_with_multiple_dimensions": sum(
        sum(bool(row.get(key)) for key in ("AssetClassName", "CurrencyGroupName", "CountryGroupName", "IndustryName")) > 1
        for row in reference["FundUnbundlingMappings"]
    ),
    "violations_with_trace": sum(bool(v.get("ViolationPath")) for c in clients for v in rows(c, "SuitabilityViolations")),
    "unresolved_within_client_links": {},
}
for source, foreign_key, target, primary_key in (
    ("Proposals", "PortfolioId", "Portfolios", "PortfolioId"),
    ("SuitabilityViolations", "PortfolioId", "Portfolios", "PortfolioId"),
    ("Transactions", "ProposalId", "Proposals", "ProposalId"),
):
    failures = Counter()
    for client in clients:
        available = {item[primary_key] for item in rows(client, target)}
        for item in rows(client, source):
            if item.get(foreign_key) not in available:
                failures[client["ClientRef"]] += 1
    report["unresolved_within_client_links"][source] = dict(failures)

client = next(c for c in clients if c["ClientRef"] == "CASE-012")
portfolio = client["Portfolios"][0]
report["case_012"] = {
    "reported_liquidity_chf": portfolio["LiquidityInDefaultCurrency"],
    "shortfall_if_15000_chf_goal_is_reconfirmed": 15000 - portfolio["LiquidityInDefaultCurrency"],
    "security_positions": len(rows(portfolio, "SecurityPositions")),
    "recorded_violations": len(rows(client, "SuitabilityViolations")),
    "existing_proposals": len(rows(client, "Proposals")),
}
client = next(c for c in clients if c["ClientRef"] == "CASE-005")
portfolio = next(p for p in client["Portfolios"] if p["PortfolioNr"] == "CASE-005-01")
covered_weight = 0
it_weight = 0
for position in rows(portfolio, "SecurityPositions"):
    security_id = position["SecurityId"]
    if security_id not in funds or not fund_totals[security_id]:
        continue
    weight = position["PortfolioValuePercentage"]
    covered_weight += weight
    it_weight += weight * sum(
        row["Weight"] for row in funds[security_id] if row.get("IndustryName") == "Information Technology"
    ) / fund_totals[security_id]
report["case_005_01"] = {
    "fund_breakdown_coverage_fraction": covered_weight,
    "it_exposure_through_covered_funds_fraction": it_weight,
}
print(json.dumps(report, indent=2))
