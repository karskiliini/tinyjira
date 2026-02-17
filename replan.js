/**
 * Re-plan algorithm for Sprint Board.
 *
 * Sorts all tasks by dependency order and priority, then assigns them
 * to sprints based on each team member's available capacity.
 *
 * Rules:
 *   1. A task that depends on other tasks (dependsOn array) cannot be placed
 *      in an earlier sprint than any of its dependencies.
 *   2. Tasks are assigned to the earliest sprint where the assignee
 *      still has enough remaining hours.
 *   3. Within a sprint, tasks are ordered by priority (high > medium > low),
 *      then alphabetically by key as a tiebreaker.
 *   4. Unassigned tasks consume no capacity and are placed as early as
 *      their dependencies allow.
 *
 * To customise the behaviour, edit the functions below:
 *   - priorityWeight()  — change how priorities are ranked
 *   - replan()          — change the assignment logic
 */

(function (root) {
  'use strict';

  // --- Helpers you can tweak ---------------------------------------------------

  /** Return a numeric weight for sorting. Lower = scheduled first. */
  function priorityWeight(priority) {
    switch (priority) {
      case 'high':   return 0;
      case 'medium': return 1;
      case 'low':    return 2;
      default:       return 3;
    }
  }

  // --- Core algorithm ----------------------------------------------------------

  /**
   * Topological sort of issues respecting dependsOn, with priority as
   * secondary sort so higher-priority tasks come first when possible.
   */
  function topoSort(issues) {
    var byId = {};
    issues.forEach(function (issue) { byId[issue.id] = issue; });

    // Build adjacency: dependsOn -> [dependents]
    var inDegree = {};
    var dependents = {};
    issues.forEach(function (issue) {
      inDegree[issue.id] = 0;
      dependents[issue.id] = [];
    });
    issues.forEach(function (issue) {
      var deps = issue.dependsOn || [];
      if (!Array.isArray(deps)) deps = deps ? [deps] : [];
      deps.forEach(function (depId) {
        if (byId[depId]) {
          inDegree[issue.id]++;
          dependents[depId].push(issue.id);
        }
      });
    });

    // Seed the queue with zero-in-degree issues, sorted by priority then key
    var queue = issues
      .filter(function (i) { return inDegree[i.id] === 0; })
      .sort(function (a, b) {
        var pw = priorityWeight(a.priority) - priorityWeight(b.priority);
        if (pw !== 0) return pw;
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });

    var result = [];

    while (queue.length > 0) {
      var issue = queue.shift();
      result.push(issue);

      // Collect newly freed dependents
      var freed = [];
      dependents[issue.id].forEach(function (depId) {
        inDegree[depId]--;
        if (inDegree[depId] === 0) {
          freed.push(byId[depId]);
        }
      });

      // Sort freed issues and merge into queue in priority order
      freed.sort(function (a, b) {
        var pw = priorityWeight(a.priority) - priorityWeight(b.priority);
        if (pw !== 0) return pw;
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });

      // Insert freed items into the queue maintaining sort order
      freed.forEach(function (f) {
        var inserted = false;
        for (var i = 0; i < queue.length; i++) {
          var cmp = priorityWeight(f.priority) - priorityWeight(queue[i].priority);
          if (cmp < 0 || (cmp === 0 && f.key < queue[i].key)) {
            queue.splice(i, 0, f);
            inserted = true;
            break;
          }
        }
        if (!inserted) queue.push(f);
      });
    }

    return result;
  }

  /**
   * Main entry point.
   *
   * @param {Array}  issues        – the full issues array (mutated in place)
   * @param {Object} teamCapacity  – e.g. { "Alice": 80, "Bob": 80 }
   * @returns {Array} the reordered issues array (same references, mutated sprint fields)
   */
  function replan(issues, teamCapacity) {
    var sorted = topoSort(issues);

    // Track per-member remaining hours in each sprint.
    // sprintRemaining[sprintNum][memberName] = hours left
    var sprintRemaining = {};

    function getRemaining(sprint, member) {
      if (!sprintRemaining[sprint]) sprintRemaining[sprint] = {};
      if (sprintRemaining[sprint][member] == null) {
        sprintRemaining[sprint][member] = teamCapacity[member] != null
          ? teamCapacity[member]
          : 80;
      }
      return sprintRemaining[sprint][member];
    }

    function consumeHours(sprint, member, hours) {
      getRemaining(sprint, member); // ensure initialised
      sprintRemaining[sprint][member] -= hours;
    }

    // Track which sprint each issue ends up in (by id), so dependents
    // know the earliest sprint they can be placed in.
    var issueSprint = {};

    sorted.forEach(function (issue) {
      // Earliest sprint from dependencies (must be >= all dependency sprints)
      var earliest = 1;
      var deps = issue.dependsOn || [];
      if (!Array.isArray(deps)) deps = deps ? [deps] : [];
      deps.forEach(function (depId) {
        if (issueSprint[depId] != null && issueSprint[depId] > earliest) {
          earliest = issueSprint[depId];
        }
      });

      var hours = issue.estimateHours || 0;
      var member = issue.assignee;

      if (!member || hours === 0) {
        // No assignee or no estimate — just respect dependency order
        issue.sprint = earliest;
        issueSprint[issue.id] = earliest;
        return;
      }

      // Find the first sprint >= earliest where this member has capacity
      var sprint = earliest;
      while (true) {
        var remaining = getRemaining(sprint, member);
        if (remaining >= hours) {
          break;
        }
        sprint++;
        // Safety: don't loop forever
        if (sprint > 100) break;
      }

      issue.sprint = sprint;
      issueSprint[issue.id] = sprint;
      consumeHours(sprint, member, hours);
    });

    return sorted;
  }

  // --- Export -------------------------------------------------------------------

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { replan: replan };
  } else {
    root.Replan = { replan: replan };
  }

})(typeof window !== 'undefined' ? window : this);
