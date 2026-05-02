import { Router } from "express";
import { z } from "zod/v4";

const router = Router();

/**
 * Returns true if the given MLS Agent ID belongs to the board
 * configured in MLS_BOARD_ID. The check is a prefix match —
 * boards encode their board code as a prefix on agent IDs (e.g. "AGMLS-12345").
 * If MLS_BOARD_ID is empty the check always passes (dev / unconfigured).
 */
export function isAgentInMarket(mlsAgentId: string): boolean {
  const boardId = process.env.MLS_BOARD_ID ?? "";
  if (!boardId) return true;
  return mlsAgentId.toUpperCase().startsWith(boardId.toUpperCase());
}

router.post("/agents/check-market", (req, res) => {
  const parsed = z.object({ mlsAgentId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "mlsAgentId is required" });
    return;
  }
  const inMarket = isAgentInMarket(parsed.data.mlsAgentId);
  res.json({ inMarket });
});

export default router;
