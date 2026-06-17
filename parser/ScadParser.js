// parser/ScadParser.js
import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

/**
 * SCAD Parser - يحول كود SCAD إلى كائنات Three.js
 * يدعم: cube, sphere, cylinder, translate, rotate, scale, union, difference, intersection, color, module
 */
class ScadParser {
    constructor() {
        this.modules = new Map();
        this.resultGroup = null;
        this.currentGroup = null;
        this.variables = {};
    }

    parse(scadCode) {
        // تنظيف الكود من التعليقات
        let cleaned = scadCode.replace(/\/\/.*$/gm, '');
        cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // إعادة تعيين الحالة
        this.modules.clear();
        this.resultGroup = new THREE.Group();
        this.currentGroup = this.resultGroup;
        this.variables = {};
        
        // تقسيم إلى tokens
        const tokens = this.tokenize(cleaned);
        this.evaluateInstructions(tokens);
        
        return this.resultGroup;
    }

    tokenize(code) {
        const tokens = [];
        const regex = /([a-zA-Z_][a-zA-Z0-9_]*)|([0-9]*\.?[0-9]+)|([\{\}\(\)\[\],])|([=])|(["'][^"']*["'])/g;
        let match;
        while ((match = regex.exec(code)) !== null) {
            tokens.push(match[0]);
        }
        return tokens;
    }

    evaluateInstructions(tokens) {
        let idx = 0;
        const peek = () => tokens[idx];
        const consume = () => tokens[idx++];
        
        const parseBlock = (stopOnBrace = true) => {
            while (idx < tokens.length && (stopOnBrace ? tokens[idx] !== '}' : true)) {
                const token = peek();
                
                if (token === 'module') {
                    // تعريف module
                    idx++;
                    const name = peek();
                    idx++;
                    if (peek() === '(') {
                        while (peek() !== ')') idx++;
                        idx++;
                    }
                    if (peek() === '{') {
                        idx++;
                        const bodyTokens = [];
                        let braceCount = 1;
                        while (idx < tokens.length && braceCount > 0) {
                            const t = peek();
                            if (t === '{') braceCount++;
                            if (t === '}') braceCount--;
                            if (braceCount > 0) bodyTokens.push(t);
                            idx++;
                        }
                        this.modules.set(name, bodyTokens.slice());
                    }
                } else if (token === '}') {
                    idx++;
                    break;
                } else if (token === '=') {
                    // متغير
                    idx++;
                } else {
                    // أمر عادي
                    const cmd = consume();
                    this.executeCommand(cmd, tokens, idx, parseBlock);
                }
            }
        };
        
        parseBlock(false);
    }

    executeCommand(cmd, tokens, idx, parseBlock) {
        const currentIdx = idx;
        
        if (cmd === 'cube') {
            if (tokens[idx] === '(') {
                idx++;
                let params = '';
                let parenCount = 1;
                while (idx < tokens.length && parenCount > 0) {
                    const t = tokens[idx];
                    if (t === '(') parenCount++;
                    if (t === ')') parenCount--;
                    if (parenCount > 0) params += t;
                    idx++;
                }
                const size = this.parseVectorParam(params, 'size', [1, 1, 1]);
                const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
                const material = new THREE.MeshStandardMaterial({ color: 0x88aaff, roughness: 0.3 });
                const mesh = new THREE.Mesh(geometry, material);
                this.currentGroup.add(mesh);
            }
        } else if (cmd === 'sphere') {
            if (tokens[idx] === '(') {
                idx++;
                let params = '';
                let parenCount = 1;
                while (idx < tokens.length && parenCount > 0) {
                    const t = tokens[idx];
                    if (t === '(') parenCount++;
                    if (t === ')') parenCount--;
                    if (parenCount > 0) params += t;
                    idx++;
                }
                const r = this.parseNumberParam(params, 'r', 1);
                const geometry = new THREE.SphereGeometry(r, 32, 32);
                const material = new THREE.MeshStandardMaterial({ color: 0xffaa88, roughness: 0.2 });
                const mesh = new THREE.Mesh(geometry, material);
                this.currentGroup.add(mesh);
            }
        } else if (cmd === 'cylinder') {
            if (tokens[idx] === '(') {
                idx++;
                let params = '';
                let parenCount = 1;
                while (idx < tokens.length && parenCount > 0) {
                    const t = tokens[idx];
                    if (t === '(') parenCount++;
                    if (t === ')') parenCount--;
                    if (parenCount > 0) params += t;
                    idx++;
                }
                const r = this.parseNumberParam(params, 'r', 1);
                const h = this.parseNumberParam(params, 'h', 2);
                const geometry = new THREE.CylinderGeometry(r, r, h, 32);
                const material = new THREE.MeshStandardMaterial({ color: 0x88ffaa, roughness: 0.3 });
                const mesh = new THREE.Mesh(geometry, material);
                this.currentGroup.add(mesh);
            }
        } else if (cmd === 'translate' || cmd === 'rotate' || cmd === 'scale') {
            // معالجة التحويلات
            if (tokens[idx] === '(') {
                idx++;
                let vecStr = '';
                let parenCount = 1;
                while (idx < tokens.length && parenCount > 0) {
                    const t = tokens[idx];
                    if (t === '(') parenCount++;
                    if (t === ')') parenCount--;
                    if (parenCount > 0) vecStr += t;
                    idx++;
                }
                const vector = this.parseVector(vecStr);
                if (tokens[idx] === '{') {
                    idx++;
                    const oldGroup = this.currentGroup;
                    const transformGroup = new THREE.Group();
                    
                    if (cmd === 'translate') {
                        transformGroup.position.set(vector[0] || 0, vector[1] || 0, vector[2] || 0);
                    } else if (cmd === 'rotate') {
                        transformGroup.rotation.set(
                            (vector[0] || 0) * Math.PI / 180,
                            (vector[1] || 0) * Math.PI / 180,
                            (vector[2] || 0) * Math.PI / 180
                        );
                    } else if (cmd === 'scale') {
                        transformGroup.scale.set(vector[0] || 1, vector[1] || 1, vector[2] || 1);
                    }
                    
                    this.currentGroup.add(transformGroup);
                    this.currentGroup = transformGroup;
                    parseBlock(true);
                    this.currentGroup = oldGroup;
                }
            }
        } else if (cmd === 'union' || cmd === 'difference' || cmd === 'intersection') {
            if (tokens[idx] === '{') {
                idx++;
                const oldGroup = this.currentGroup;
                const tempGroup = new THREE.Group();
                this.currentGroup = tempGroup;
                parseBlock(true);
                this.currentGroup = oldGroup;
                
                if (cmd === 'union') {
                    // إضافة جميع الأبناء مباشرة
                    tempGroup.children.forEach(child => this.currentGroup.add(child));
                } else {
                    // difference أو intersection - نسخة مبسطة
                    console.warn(`${cmd} requires CSG library. Using fallback.`);
                    tempGroup.children.forEach(child => this.currentGroup.add(child));
                }
            }
        } else if (cmd === 'color') {
            if (tokens[idx] === '(') {
                idx++;
                let colorStr = '';
                let parenCount = 1;
                while (idx < tokens.length && parenCount > 0) {
                    const t = tokens[idx];
                    if (t === '(') parenCount++;
                    if (t === ')') parenCount--;
                    if (parenCount > 0) colorStr += t;
                    idx++;
                }
                const colorHex = this.parseColor(colorStr);
                if (tokens[idx] === '{') {
                    idx++;
                    const oldGroup = this.currentGroup;
                    const colorGroup = new THREE.Group();
                    this.currentGroup.add(colorGroup);
                    this.currentGroup = colorGroup;
                    parseBlock(true);
                    this.applyColorToGroup(colorGroup, colorHex);
                    this.currentGroup = oldGroup;
                }
            }
        } else {
            // استدعاء module
            if (this.modules.has(cmd)) {
                if (tokens[idx] === '(') {
                    while (tokens[idx] !== ')') idx++;
                    idx++;
                }
                const bodyTokens = this.modules.get(cmd);
                const subParser = new ScadParser();
                subParser.modules = this.modules;
                subParser.resultGroup = new THREE.Group();
                subParser.currentGroup = subParser.resultGroup;
                subParser.evaluateInstructions(bodyTokens);
                subParser.resultGroup.children.forEach(child => {
                    this.currentGroup.add(child.clone());
                });
            }
        }
    }

    // دوال مساعدة
    parseVectorParam(params, paramName, defaultValue) {
        const regex = new RegExp(`${paramName}\\s*=\\s*\\[([^\\]]+)\\]`);
        const match = params.match(regex);
        if (match) {
            return match[1].split(',').map(Number);
        }
        return defaultValue;
    }

    parseNumberParam(params, paramName, defaultValue) {
        const regex = new RegExp(`${paramName}\\s*=\\s*([0-9.]+)`);
        const match = params.match(regex);
        if (match) return parseFloat(match[1]);
        return defaultValue;
    }

    parseVector(vecStr) {
        const nums = vecStr.match(/[-+]?[0-9]*\.?[0-9]+/g);
        if (nums) return nums.map(Number);
        return [0, 0, 0];
    }

    parseColor(colorStr) {
        const str = colorStr.trim().replace(/['"]/g, '');
        const colors = {
            red: 0xff0000, green: 0x00ff00, blue: 0x0000ff,
            yellow: 0xffff00, white: 0xffffff, black: 0x000000,
            orange: 0xff8800, purple: 0x8800ff, pink: 0xff0088
        };
        if (colors[str]) return colors[str];
        if (str.startsWith('#')) return parseInt(str.slice(1), 16);
        return 0xcccccc;
    }

    applyColorToGroup(group, colorHex) {
        group.traverse(child => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({ 
                    color: colorHex,
                    roughness: 0.3,
                    metalness: 0.1
                });
            }
        });
    }
}

export default ScadParser;