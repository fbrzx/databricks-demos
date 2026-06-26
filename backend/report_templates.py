"""Curated report starters for the Genie report builder."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class ReportTemplate:
    id: str
    title: str
    description: str
    prompt: str
    visual_type: str
    preferred_export: str
    required_columns: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


REPORT_TEMPLATES: tuple[ReportTemplate, ...] = (
    ReportTemplate(
        id="store-period-purchase-volume",
        title="Store Purchase Volume",
        description="Compare purchase and responder volumes across stores and financial periods.",
        prompt=(
            "Show aggregate purchase volume and responder volume by store for the most "
            "recent complete financial period. Include store, purchase volume, responder "
            "volume, and response rate."
        ),
        visual_type="bar",
        preferred_export="pptx",
        required_columns=[
            "store",
            "purchase_volume",
            "responder_volume",
            "response_rate",
        ],
    ),
    ReportTemplate(
        id="purchase-trend-period",
        title="Purchase Trend",
        description="Track orders, quantities, and purchase amounts over financial periods.",
        prompt=(
            "Show aggregate total orders, total quantity, and total purchase amount by "
            "financial period for the latest available periods. Include period-over-period "
            "change where available."
        ),
        visual_type="line",
        preferred_export="pptx",
        required_columns=[
            "financial_period",
            "total_orders",
            "total_quantity",
            "purchase_amount",
        ],
    ),
    ReportTemplate(
        id="email-engagement-funnel",
        title="Email Engagement Funnel",
        description="Measure email opens, responses, orders, and rates by campaign period.",
        prompt=(
            "Summarize aggregate email engagement by financial period. Include sent volume "
            "if available, open rate, responder volume, response rate, order volume, and "
            "purchase amount."
        ),
        visual_type="grouped_bar",
        preferred_export="pptx",
        required_columns=[
            "financial_period",
            "open_rate",
            "responder_volume",
            "response_rate",
            "order_volume",
        ],
    ),
    ReportTemplate(
        id="offer-level-effectiveness",
        title="Offer Effectiveness",
        description="Compare response and order performance across email offer levels.",
        prompt=(
            "Compare aggregate performance by offer level for the most recent complete "
            "financial period. Include offer level, response rate, order volume, total "
            "quantity, and purchase amount."
        ),
        visual_type="bar",
        preferred_export="pdf",
        required_columns=[
            "offer_level",
            "response_rate",
            "order_volume",
            "total_quantity",
            "purchase_amount",
        ],
    ),
    ReportTemplate(
        id="price-sensitivity-offer-level",
        title="Price Sensitivity",
        description="Assess how purchase amount and quantity vary by offer level.",
        prompt=(
            "Assess aggregate price sensitivity by offer level. Include offer level, "
            "average purchase amount, average quantity, response rate, and order volume."
        ),
        visual_type="bar",
        preferred_export="pptx",
        required_columns=[
            "offer_level",
            "average_purchase_amount",
            "average_quantity",
            "response_rate",
            "order_volume",
        ],
    ),
    ReportTemplate(
        id="store-engagement-rates",
        title="Store Engagement Rates",
        description="Find stores with high or low email open and response rates.",
        prompt=(
            "Rank stores by aggregate email open rate and response rate for the most "
            "recent complete financial period. Include store, open rate, response rate, "
            "responder volume, order volume, and purchase amount."
        ),
        visual_type="bar",
        preferred_export="xlsx",
        required_columns=[
            "store",
            "open_rate",
            "response_rate",
            "responder_volume",
            "order_volume",
            "purchase_amount",
        ],
    ),
    ReportTemplate(
        id="store-campaign-watchlist",
        title="Campaign Watchlist",
        description="Surface aggregate store and campaign periods that need follow-up.",
        prompt=(
            "Identify store and financial-period combinations with unusually low open "
            "rate, response rate, or order performance. Use aggregate metrics only and "
            "include store, financial period, metric, value, benchmark, and impact."
        ),
        visual_type="table",
        preferred_export="xlsx",
        required_columns=[
            "store",
            "financial_period",
            "metric",
            "value",
            "benchmark",
            "impact",
        ],
    ),
)


def list_report_templates() -> list[dict]:
    return [template.to_dict() for template in REPORT_TEMPLATES]


def get_report_template(template_id: str) -> ReportTemplate | None:
    return next(
        (template for template in REPORT_TEMPLATES if template.id == template_id),
        None,
    )
