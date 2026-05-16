    function renderTrains(simTime) {
        if (!fahrplanData || projectedStations.length === 0) return;
        const svgTrains = document.getElementById('svg-trains');
        const svgTrainTimes = document.getElementById('svg-train-times');
        const svgTrainList = document.getElementById('svg-train-list');
        svgTrains.innerHTML = ''; svgTrainTimes.innerHTML = ''; svgTrainList.innerHTML = '';
        const nowMins = simTime.getHours() * 60 + simTime.getMinutes();
        const kwWest = projectedStations.find(s => s.name === "Kühlungsborn West");
        const bdBahnhof = projectedStations.find(s => s.name === "Bad Doberan Bahnhof");
        
        const colors = ['#e67e22', '#3498db']; 
        let activeTrains = [];
        let futureTrains = [];

        fahrplanData.directions.forEach((dir, dIdx) => {
            const isToDoberan = dIdx === 0;
            const dirColor = colors[dIdx];
            
            dir.trains.forEach(train => {
                if (!isTrainRunningToday(train.restriction, simTime)) return;
                
                const timesArr = train.times.map(t => timeToMinutes(t, 'arr'));
                const timesDep = train.times.map(t => timeToMinutes(t, 'dep'));
                
                let startIdx = -1, endIdx = -1;
                for(let i=0; i<timesArr.length; i++) if(timesArr[i] !== null) { if(startIdx === -1) startIdx = i; endIdx = i; }
                
                // Züge für "Nächste Züge" sammeln
                if (nowMins < timesArr[startIdx]) {
                    futureTrains.push({ train, dir, dIdx, startTime: timesArr[startIdx], startStation: dir.stations[startIdx] });
                }

                if(nowMins < timesArr[startIdx] || nowMins > timesDep[endIdx]) return;
                
                let tx = null, ty = null, angle = 0, currentLegEnd = -1;

                // 1. Prüfen, ob der Zug an einem Bahnhof STEHT
                for (let i = 0; i < timesArr.length; i++) {
                    if (timesArr[i] !== null && timesDep[i] !== null) {
                        if (nowMins >= timesArr[i] && nowMins < timesDep[i]) {
                            const p = projectedStations.find(s => s.name === dir.stations[i]);
                            tx = p.x; ty = p.y;
                            angle = (i < dir.stations.length - 1) ? Math.atan2(projectedStations.find(s => s.name === dir.stations[i+1]).y - p.y, projectedStations.find(s => s.name === dir.stations[i+1]).x - p.x) * 180 / Math.PI : 0;
                            currentLegEnd = i;
                            break;
                        }
                    }
                }

                // 2. Falls nicht stehend, Leg-Position berechnen
                if (tx === null) {
                    for (let i = 0; i < timesDep.length - 1; i++) {
                        const start = timesDep[i];
                        let nextArrIdx = i + 1;
                        while (nextArrIdx < timesArr.length && timesArr[nextArrIdx] === null) nextArrIdx++;
                        if (nextArrIdx >= timesArr.length) continue;

                        const end = timesArr[nextArrIdx];
                        if (start !== null && end !== null && nowMins >= start && nowMins <= end) {
                            const p1 = projectedStations.find(s => s.name === dir.stations[i]);
                            const p2 = projectedStations.find(s => s.name === dir.stations[nextArrIdx]);
                            const factor = (end - start === 0) ? 0 : (nowMins - start) / (end - start);
                            tx = p1.x + (p2.x - p1.x) * factor;
                            ty = p1.y + (p2.y - p1.y) * factor;
                            angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
                            currentLegEnd = nextArrIdx;
                            break;
                        }
                    }
                }

                if (tx !== null) {
                    activeTrains[dIdx] = { train, legEnd: currentLegEnd };

                    const triangle = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    const size = 12;
                    triangle.setAttribute("d", `M ${-size},${-size/1.5} L ${size},0 L ${-size},${size/1.5} Z`);
                    triangle.setAttribute("fill", dirColor);
                    triangle.setAttribute("transform", `translate(${tx},${ty}) rotate(${angle})`);
                    svgTrains.appendChild(triangle);

                    const trainNumLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    const labelYOffset = isToDoberan ? -15 : 20;
                    trainNumLabel.setAttribute("x", tx);
                    trainNumLabel.setAttribute("y", ty + labelYOffset);
                    trainNumLabel.setAttribute("text-anchor", "middle");
                    trainNumLabel.setAttribute("font-size", "12");
                    trainNumLabel.setAttribute("font-weight", "bold");
                    trainNumLabel.setAttribute("fill", dirColor);
                    trainNumLabel.textContent = train.id;
                    svgTrains.appendChild(trainNumLabel);

                    dir.stations.forEach((stationName, sIdx) => {
                        const timeStr = train.times[sIdx];
                        if (!timeStr || timeStr === '-') return;
                        const bf = projectedStations.find(s => s.name === stationName);
                        const originalIdx = bfData.findIndex(b => b.name === stationName);
                        let vertOffset = (originalIdx % 2 === 0 ? -20 : 30);
                        if (stationName === "Bad Doberan Goethestraße") vertOffset += 40;
                        
                        const timeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        const labelWidth = getLabelWidth(stationName);
                        const gap = 4;
                        const xOffset = isToDoberan ? (labelWidth / 2 + gap) : -(labelWidth / 2 + gap);
                        
                        timeLabel.setAttribute("x", bf.x + xOffset);
                        timeLabel.setAttribute("y", bf.y + vertOffset);
                        timeLabel.setAttribute("text-anchor", isToDoberan ? "start" : "end");
                        timeLabel.setAttribute("font-size", "11");
                        timeLabel.setAttribute("font-weight", "bold");
                        timeLabel.setAttribute("fill", timesDep[sIdx] < nowMins ? "#bbb" : dirColor);
                        
                        if (timeStr.includes('/')) {
                            const [arr, dep] = timeStr.split('/');
                            const tspanArr = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                            tspanArr.textContent = arr;
                            tspanArr.setAttribute("x", bf.x + xOffset);
                            const tspanDep = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                            tspanDep.textContent = dep;
                            tspanDep.setAttribute("x", bf.x + xOffset);
                            tspanDep.setAttribute("dy", "1.1em");
                            timeLabel.appendChild(tspanArr);
                            timeLabel.appendChild(tspanDep);
                        } else {
                            timeLabel.textContent = timeStr;
                        }
                        svgTrainTimes.appendChild(timeLabel);
                    });
                }
            });

            // Falls kein aktiver Zug, nächsten Zug für die Liste suchen
            if (!activeTrains[dIdx]) {
                let nextTrain = null;
                dir.trains.forEach(train => {
                    if (!isTrainRunningToday(train.restriction, simTime)) return;
                    const times = train.times.map(t => timeToMinutes(t, 'arr'));
                    let startIdx = -1;
                    for(let i=0; i<times.length; i++) if(times[i] !== null) { startIdx = i; break; }
                    if (nowMins < times[startIdx]) {
                        if (!nextTrain || times[startIdx] < nextTrain.startTime) {
                            nextTrain = { train, legEnd: startIdx, startTime: times[startIdx] };
                        }
                    }
                });
                if (nextTrain) activeTrains[dIdx] = nextTrain;
            }
            
            // Laufweg-Liste (Tabelle)
            if (activeTrains[dIdx]) {
                const { train, legEnd } = activeTrains[dIdx];
                let listX = isToDoberan ? 0 : 740;
                let listY = isToDoberan ? kwWest.y + 95 : bdBahnhof.y - 425;
                
                const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
                fo.setAttribute("x", listX); fo.setAttribute("y", listY);
                fo.setAttribute("width", "260"); fo.setAttribute("height", "400");
                
                let tableHtml = `<div xmlns="http://www.w3.org/1999/xhtml" style="font-family: inherit; background: rgba(255,255,255,0.9); padding: 8px; border-radius: 6px; border: 2px solid ${dirColor}; box-shadow: 0 2px 5px rgba(0,0,0,0.1); box-sizing: border-box;">
                    <div style="font-weight: bold; color: ${dirColor}; margin-bottom: 8px; font-size: 14px;">Zug ${train.id} nach ${dir.to}</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                        <tr style="border-bottom: 2px solid #ccc; color: #666;">
                            <th style="padding: 3px; text-align: left;">Ank.</th>
                            <th style="padding: 3px; text-align: left;">Abf.</th>
                            <th style="padding: 3px; text-align: left;">Bahnhof</th>
                        </tr>`;

                dir.stations.forEach((stationName, sIdx) => {
                    const timeStr = train.times[sIdx];
                    if (!timeStr || timeStr === '-') return;
                    const depMins = timeToMinutes(timeStr, 'dep');
                    const isPast = (depMins < nowMins);
                    const isNextStop = (sIdx === legEnd);
                    let styleStr = isNextStop ? `font-weight: bold; color: ${dirColor}; background: rgba(${isToDoberan ? '230,126,34' : '52,152,219'}, 0.1);` : (isPast ? "color: #bbb;" : "color: #333;");
                    
                    let ank = "", abf = "";
                    if (timeStr.includes('/')) {
                        [ank, abf] = timeStr.split('/');
                    } else {
                        if (sIdx === dir.stations.length - 1) ank = timeStr; else abf = timeStr;
                    }

                    tableHtml += `<tr style="border-bottom: 1px solid #eee; ${styleStr}">
                        <td style="padding: 4px 3px;">${ank}</td>
                        <td style="padding: 4px 3px;">${abf}</td>
                        <td style="padding: 4px 3px;">${stationName}</td>
                    </tr>`;
                });
                tableHtml += `</table></div>`;
                fo.innerHTML = tableHtml;
                svgTrainList.appendChild(fo);
            }
        });

        // Nächste Züge (Zentriert unten)
        futureTrains.sort((a, b) => a.startTime - b.startTime);
        let nextListX = 500;
        let nextListY = 520;
        const nextTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
        nextTitle.setAttribute("x", nextListX); nextTitle.setAttribute("y", nextListY);
        nextTitle.setAttribute("text-anchor", "middle"); nextTitle.setAttribute("font-size", "14");
        nextTitle.setAttribute("font-weight", "bold"); nextTitle.setAttribute("fill", "#b00000");
        nextTitle.textContent = "Nächste Züge";
        svgTrainList.appendChild(nextTitle);

        futureTrains.slice(0, 2).forEach((ft, i) => {
            const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
            txt.setAttribute("x", nextListX); txt.setAttribute("y", nextListY + 20 + (i * 18));
            txt.setAttribute("text-anchor", "middle"); txt.setAttribute("font-size", "12");
            txt.setAttribute("fill", colors[ft.dIdx]);
            
            const timeStr = ft.train.times.find(t => t && t !== '-').split('/')[0];
            txt.textContent = `${timeStr} ab ${ft.startStation} nach ${ft.dir.to}`;
            svgTrainList.appendChild(txt);
        });
    }

    function varProp(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

    function updateHighlighting(simTime) {
        const nowMinutes = simTime.getHours() * 60 + simTime.getMinutes();
        document.querySelectorAll('td[data-time]').forEach(td => {
            td.classList.remove('next-train');
            const timeStr = td.getAttribute('data-time');
            if (timeStr && timeStr !== '-') {
                const mins = timeToMinutes(timeStr, 'arr');
                const diff = mins - nowMinutes;
                if (diff >= 0 && diff <= 10) td.classList.add('next-train');
            }
        });
    }

    function showTab(tabId) {
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        if (event && event.currentTarget) event.currentTarget.classList.add('active');
        if (tabId === 'strecke') renderRoute();
    }

    init();
</script>
</body>
</html>
