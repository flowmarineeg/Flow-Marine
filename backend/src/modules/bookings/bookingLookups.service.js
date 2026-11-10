'use strict';

// Slim lookup data for the booking forms. Partner users cannot reach the agents / rounds / container-type
// modules (rbac), so every booking screen reads its pick-lists from here instead: no bank details, no money.

const Agent = require('../agents/agent.model');
const Round = require('../rounds/round.model');
const ContainerType = require('../containerTypes/containerType.model');
const Partner = require('../partners/partner.model');

/** Distinct ports of a round's own legs, with the leg keys they appear at (a port can repeat). */
const roundPorts = (round) => {
  const byPort = new Map();
  const legs = [...(round?.routeSnapshot?.legs || [])].sort((a, b) => a.sequence - b.sequence);
  for (const l of legs) {
    const k = String(l.portId);
    if (!byPort.has(k)) byPort.set(k, { portId: k, name: l.portName || null, code: l.portCode || null, legs: [] });
    byPort.get(k).legs.push({ legKey: l.legKey, sequence: l.sequence });
  }
  return [...byPort.values()];
};

const getLookups = async ({ roundId, partnerScope = null } = {}) => {
  const [agents, rounds, containerTypes, partners] = await Promise.all([
    Agent.find({ status: 'Active' }).select('agentCode agentName').sort({ agentName: 1 }).lean(),
    Round.find({ status: { $in: ['Planned', 'Active'] }, closeStatus: { $ne: 'Closed' } })
      .select('roundNumber roundName status startDate endDate').sort({ startDate: -1 }).lean(),
    ContainerType.find().select('code size type').sort({ code: 1 }).lean(),
    // a partner user never picks a partner: the label is theirs
    partnerScope ? [] : Partner.find({ status: 'Active' }).select('code name').sort({ name: 1 }).lean(),
  ]);
  let ports = [];
  if (roundId) {
    const round = await Round.findById(roundId).select('routeSnapshot').lean();
    ports = roundPorts(round);
  }
  return { agents, rounds, containerTypes, ports, partners };
};

module.exports = { getLookups, roundPorts };
