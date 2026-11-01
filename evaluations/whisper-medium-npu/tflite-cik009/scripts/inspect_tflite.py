#!/usr/bin/env python3
"""Dump signatures, subgraph I/O, operator counts and constant tensor types of a .tflite FlatBuffer.
Usage: python -I inspect_tflite.py model.tflite > inspect.json   (needs: pip install tflite numpy)
"""
import sys, json, collections, tflite
buf = open(sys.argv[1], 'rb').read()
m = tflite.Model.GetRootAsModel(buf, 0)
ops = {}
for i in range(m.OperatorCodesLength()):
    oc = m.OperatorCodes(i)
    code = max(oc.BuiltinCode(), oc.DeprecatedBuiltinCode())
    name = {v: k for k, v in tflite.BuiltinOperator.__dict__.items() if not k.startswith('_')}.get(code, str(code))
    if code == tflite.BuiltinOperator.CUSTOM: name = 'CUSTOM:' + oc.CustomCode().decode()
    ops[i] = name
TT = {v: k for k, v in tflite.TensorType.__dict__.items() if not k.startswith('_')}
out = {"version": m.Version(), "description": (m.Description() or b'').decode(errors='replace'),
       "subgraphs": [], "signatures": [], "metadata": []}
for i in range(m.MetadataLength()):
    out["metadata"].append(m.Metadata(i).Name().decode())
for i in range(m.SignatureDefsLength()):
    s = m.SignatureDefs(i)
    out["signatures"].append({"key": s.SignatureKey().decode(), "subgraph": s.SubgraphIndex(),
        "inputs": [s.Inputs(j).Name().decode() for j in range(s.InputsLength())],
        "outputs": [s.Outputs(j).Name().decode() for j in range(s.OutputsLength())]})
weight_types = collections.Counter(); weight_bytes = collections.Counter()
for g in range(m.SubgraphsLength()):
    sg = m.Subgraphs(g)
    def tinfo(t):
        T = sg.Tensors(t)
        return {"name": T.Name().decode(), "type": TT.get(T.Type()), "shape": T.ShapeAsNumpy().tolist() if T.ShapeLength() else [],
                "shape_signature": T.ShapeSignatureAsNumpy().tolist() if T.ShapeSignatureLength() else None}
    opc = collections.Counter(ops[sg.Operators(o).OpcodeIndex()] for o in range(sg.OperatorsLength()))
    for t in range(sg.TensorsLength()):
        T = sg.Tensors(t); b = m.Buffers(T.Buffer())
        if b is not None and b.DataLength() > 0:
            weight_types[TT.get(T.Type())] += 1; weight_bytes[TT.get(T.Type())] += b.DataLength()
        elif b is not None and b.Size() > 0:
            weight_types[TT.get(T.Type())] += 1; weight_bytes[TT.get(T.Type())] += b.Size()
    out["subgraphs"].append({"index": g, "name": (sg.Name() or b'').decode(), "operators": sg.OperatorsLength(),
        "tensors": sg.TensorsLength(), "inputs": [tinfo(t) for t in sg.InputsAsNumpy()],
        "outputs": [tinfo(t) for t in sg.OutputsAsNumpy()], "op_counts": dict(opc.most_common())})
out["constant_tensors_by_type"] = dict(weight_types); out["constant_bytes_by_type"] = dict(weight_bytes)
print(json.dumps(out, indent=1))
